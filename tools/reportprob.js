/* __GC_PATCH_REPORTPROB__ — 🆘 REPORT A PROBLEM / ASK A QUESTION (owner 11/18: "Do they have where they can report issues with
   CRM or ask questions"). tools/patch_REPORTPROB.py puts this file in index.html.
   • Where: Desk — the FIRST item of the 💎 menu (pinned on top until 2026-12-16, then a normal 💎 item); GrayCo Field — ☰ More
     (Office rows) and a small ❓ on the Field home. Every signed-in staff role (subs and customers never sign in here).
   • The form: what kind (💥 Something broke · 🔎 I can't find something · ❓ Question · 💡 Idea), a short text, an optional
     screenshot / photo (made small on the device: ≤ 1280 px JPEG), and "what screen I was on" (taken when the button is
     pressed). Attached by itself: this device (gc_adm_device_id — the same id as PERFREP and BOOTWATCH), phone / tablet /
     pc, Desk / Field, the version, the screen, and the last 20 page errors / slow taps / failed server calls of this device
     (PERFREP's _gcPerfRep.report()). No passwords, no keystrokes.
   • Saved: gc_kv gc_problem_reports — a JSON-text list, append only (read, add, write, read back: nobody's report is lost;
     never deleted); status open → answered → fixed. The errors / slow taps: gc_problem_detail_<id>; the photo:
     gc_problem_shot_<id>. No signal: kept on this device and sent when it is back.
   • Told: the admins and the office (window._gcNotify — the AWAY staff notices: phone push, else a staff text; the 9 PM – 7 AM
     quiet hours and Away are respected by the server).
   • 🆘 Problem reports (admins and the office; 💎 menu, Field ☰ More, ⚙ Admin): Open / Answered / Fixed; answer each one —
     the reporter gets the answer as a CRM notice (and a phone notice) — and ✓ Mark fixed. The answer goes into the
     reporter's own small row gc_problem_inbox_<e-mail>, which their CRM reads when it opens (and every 4 minutes while they
     have a report that is not fixed).
   • The sign-in screen: "Can't sign in? Report it" — works signed out (name and phone typed in), through
     /.netlify/functions/problem-report (BOOTWATCH's limits); the Marketing Manager's sign-in cannot write gc_kv, so his
     reports go the same way (his sign-in token says who he is).
   • Questions go to the admins / office like the rest (no automatic answers here).
   Console: _gcReportProb.open(), .list(), .mine(), .state()   Off on this device: localStorage gc_reportprob_off = '1' */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_REPORTPROB__) return; W.__GC_PATCH_REPORTPROB__ = true;
try { if (localStorage.getItem('gc_reportprob_off') === '1') return; } catch (e) {}
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function every(f, ms){ return RI.call(W, f, ms); }
var KEY = 'gc_problem_reports', DETAIL = 'gc_problem_detail_', SHOT = 'gc_problem_shot_', INBOX = 'gc_problem_inbox_';
var FN = '/.netlify/functions/problem-report', PIN_UNTIL = '2026-12-16';
var MINE = 'gc_rp_mine', OUTBOX = 'gc_rp_outbox';
var TYPES = [{ k: 'broke', ic: '💥', l: 'Something broke' }, { k: 'find', ic: '🔎', l: "I can't find something" }, { k: 'question', ic: '❓', l: 'Question' }, { k: 'idea', ic: '💡', l: 'Idea' }];
var TYPE_L = { broke: '💥 Something broke', find: "🔎 Can't find something", question: '❓ Question', idea: '💡 Idea', signin: "🔑 Can't sign in" };
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function clip(t, n){ return s(t).replace(/\s+/g, ' ').slice(0, n); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function jget(k, d){ try { var v = JSON.parse(lsGet(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
function jset(k, v){ return lsSet(k, JSON.stringify(v)); }
function warn(e){ try { console.warn('[GC REPORTPROB]', e && e.message || e); } catch (x) {} }
function wait(ms){ return new Promise(function(r){ later(r, ms); }); }
function nowIso(){ return new Date().toISOString(); }
function ymdC(t){ try { return new Date(t == null ? Date.now() : t).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); } catch (e) { return new Date().toISOString().slice(0, 10); } }
function slug(e){ return low(e).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80); }
function ago(iso){ var t = Date.parse(iso); if (!t) return ''; var m = Math.round((Date.now() - t) / 60e3); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + ' h ago'; var d = Math.round(h / 24); return d < 8 ? d + ' day' + (d === 1 ? '' : 's') + ' ago' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined }); }
function when(iso){ var t = Date.parse(iso); return t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }

/* ── who ── */
function myEmail(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function signedIn(){ return !!myEmail(); }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function isMM(){ try { return typeof W._gcIsMM === 'function' && !!W._gcIsMM(); } catch (e) { return false; } }
function users(){ return arr((W._crm || {}).users).filter(function(u){ return u.active !== false && /@/.test(s(u.email)); }); }
function me(){ var e = myEmail(); return users().filter(function(u){ return low(u.email) === e; })[0] || null; }
function myName(){ var u = me(); return s(u && u.name) || myEmail().split('@')[0]; }
function officeOf(u){ return /office/i.test(s(u && u.role)) && !/^admin$/i.test(s(u && u.role)); }
function adminOf(u){ return /^admin$/i.test(s(u && u.role)) || low(u && u.payType) === 'owner'; }
/* the list is for the admins and the office (they are the ones told) */
function canList(){ if (!signedIn() || isMM()) return false; if (isAdmin()) return true; try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {} return officeOf(me()); }
function recipients(){ var e = myEmail(); return users().filter(function(u){ return adminOf(u) || officeOf(u); }).map(function(u){ return low(u.email); }).filter(function(x, i, a){ return x && x !== e && a.indexOf(x) === i; }); }

/* ── this device, this screen ── */
function devId(){ var d = lsGet('gc_adm_device_id'); if (!d || !/^[A-Za-z0-9_-]{4,40}$/.test(d)) { d = 'P' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); lsSet('gc_adm_device_id', d); } return d; }
function kind(){ var k = ''; try { k = W._gcAwayDevice ? s(W._gcAwayDevice()) : ''; } catch (e) {} if (!k) { var ua = s(navigator.userAgent); k = /iPad|Tablet/i.test(ua) ? 'tablet' : /iPhone|Android.+Mobile|Mobile Safari/i.test(ua) ? 'phone' : 'pc'; } return k === 'computer' ? 'pc' : k; }
function app(){ return D.documentElement.classList.contains('_fieldmode') ? 'field' : 'desk'; }
function build(){ return s(W.__GC_BUILD_ID__).slice(0, 40); }
function view(){ return s(lsGet('grayco_view')).slice(0, 50); }
function visible(e){ try { var c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden' && e.getClientRects().length > 0; } catch (x) { return false; } }
function topTitle(){
  try {
    var kids = D.body.children;
    for (var i = kids.length - 1; i >= 0; i--) {
      var e = kids[i];
      if (/^(SCRIPT|STYLE|LINK)$/.test(e.tagName) || /^gc-rp-/.test(e.id) || e.classList.contains('gc-hub-panel') || e.classList.contains('gc-fh-sheet') || e.classList.contains('gc-ra-sheet') || /toast/i.test(e.id + ' ' + e.className)) continue;   /* a menu (☰ More, 💎) is not the screen */
      if (e.id === '_gcJobPick' || e.id === '_gcJobDash' || e.id === 'gc-fh-tabs' || e.id === 'root') continue;
      var c = getComputedStyle(e); if (c.position !== 'fixed' || c.display === 'none' || c.visibility === 'hidden') continue;
      var r = e.getBoundingClientRect(); if (r.width * r.height < 0.2 * innerWidth * innerHeight) continue;
      var h = e.querySelector('h1,h2,h3,.hd b,[role="dialog"] b'); if (h && s(h.textContent)) return clip(h.textContent, 60);
    }
    var h1 = D.querySelector('#root main h1'); if (h1 && visible(h1)) return clip(h1.textContent, 60);
  } catch (e) {}
  return '';
}
function screenNow(){
  var p = [];
  if (app() === 'field') {
    if (D.getElementById('_gcJobDash')) { var j = null; try { j = W._gcCurrentJob; } catch (e) {} p.push('Field · job page' + (j && j.name ? ' (' + clip(j.name, 40) + ')' : '')); }
    else if (D.getElementById('_gcJobPick')) p.push('Field · home'); else p.push('Field');
  } else p.push('Desk · ' + (view() || 'dashboard'));
  var t = topTitle(); if (t && p[0].indexOf(t) < 0) p.push(t);
  if (/^#[a-z]/i.test(location.hash || '')) p.push(clip(location.hash, 30));
  return p.join(' — ').slice(0, 160);
}
/* the last 20 page errors / slow taps / failed server calls of this device (PERFREP) */
function diag(){
  var R = null; try { R = W._gcPerfRep && W._gcPerfRep.report ? W._gcPerfRep.report() : null; } catch (e) {}
  if (!R) return [];
  var out = [];
  try { Object.keys(R.err || {}).forEach(function(k){ var e = R.err[k] || {}; out.push({ k: 'err', at: s(e.last), t: clip(k, 200), n: e.n, v: s(e.v).slice(0, 40) }); }); } catch (e) {}
  try { arr(R.lt).forEach(function(x){ out.push({ k: 'slow', at: x.at ? new Date(x.at).toISOString() : '', t: clip((x.act ? x.act : 'page stall') + (x.scr ? ' (scroll)' : ''), 200), ms: x.ms, v: s(x.v).slice(0, 40) }); }); } catch (e) {}
  try { Object.keys(R.net || {}).forEach(function(k){ var e = R.net[k] || {}; out.push({ k: 'net', at: s(e.last), t: clip(k, 200), n: e.n, v: s(e.v).slice(0, 40) }); }); } catch (e) {}
  return out.sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); }).slice(0, 20);
}

/* ── gc_kv (the page's own sign-in is added to these calls) ── */
function creds(){ return { u: s(lsGet('grayco_sb_url')).replace(/\/$/, ''), k: s(lsGet('grayco_sb_key')) }; }
function kvRead(key){
  var c = creds(); if (!c.u || !c.k) return Promise.resolve(null);
  return W.fetch(c.u + '/rest/v1/gc_kv?select=value,updated_at&key=eq.' + encodeURIComponent(key), { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; })
    .then(function(rows){ if (!Array.isArray(rows)) return null; var v = rows[0] ? rows[0].value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = { __bad: true }; } } return { value: v, at: rows[0] ? s(rows[0].updated_at) : '' }; });
}
function kvWrite(key, value){
  var c = creds(); if (!c.u || !c.k) return Promise.resolve(false);
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: c.k, Authorization: 'Bearer ' + c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) }).then(function(r){ return !!(r && r.ok); }, function(){ return false; });
}
/* change the shared list without losing anybody's report: read, change, write (JSON text), read back; never over an unreadable one */
function listUpdate(key, mutate, check){
  var tries = 0;
  function once(){
    return kvRead(key).then(function(cur){
      if (!cur) return 'retry';
      if (cur.value != null && !Array.isArray(cur.value)) return 'bad';
      var next = mutate(arr(cur.value)); if (!next) return true;
      return kvWrite(key, JSON.stringify(next)).then(function(ok){ return ok ? kvRead(key) : null; }).then(function(after){ return after && Array.isArray(after.value) && check(after.value) ? true : 'retry'; });
    }).then(function(r){ if (r === true) return true; if (r === 'bad' || ++tries >= 4) return false; return wait(250 * tries + Math.random() * 300).then(once); });
  }
  return once();
}
function union(list, rec){ var i = -1; list.forEach(function(x, j){ if (x.id === rec.id) i = j; }); if (i < 0) return list.concat([rec]); if (s(rec.updatedAt) > s(list[i].updatedAt)) list[i] = rec; return list; }
function fnCall(body){
  return W.fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e) { j = { error: t.slice(0, 200) }; } j.__status = r.status; return j; }); }, function(){ return { error: 'No internet connection — try again when you have signal.', __status: 0 }; });
}

/* ── the photo: made small on the device ── */
function shrink(file){
  return new Promise(function(res, rej){
    if (!file) { res(''); return; }
    if (!/^image\//.test(s(file.type))) { rej(new Error('That file is not a picture.')); return; }
    var url = ''; try { url = URL.createObjectURL(file); } catch (e) { rej(e); return; }
    var img = new Image();
    img.onload = function(){
      try {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, sc = Math.min(1, 1280 / Math.max(w, h, 1));
        var c = D.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        var q = 0.72, d = c.toDataURL('image/jpeg', q);
        while (d.length > 600 * 1024 && q > 0.3) { q -= 0.14; d = c.toDataURL('image/jpeg', q); }
        URL.revokeObjectURL(url); res(d);
      } catch (e) { URL.revokeObjectURL(url); rej(e); }
    };
    img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('That picture could not be read.')); };
    img.src = url;
  });
}

/* ── the look ── */
var CSS_ON = false;
function css(){
  if (CSS_ON) return; CSS_ON = true;
  var st = D.createElement('style'); st.id = 'gc-rp-css';
  st.textContent = '.gc-rp-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(6,12,20,.62);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;font:14px Inter,-apple-system,Segoe UI,Arial,sans-serif;color:#0f172a}' +
    '.gc-rp-ov *{box-sizing:border-box}.gc-rp-card{background:#fff;width:100%;max-width:600px;max-height:92vh;overflow:auto;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.4);-webkit-overflow-scrolling:touch}' +
    '.gc-rp-card.wide{max-width:900px}.gc-rp-hd{position:sticky;top:0;background:#fff;display:flex;align-items:center;gap:8px;padding:14px 16px 10px;border-bottom:1px solid #e2e8f0;z-index:1}' +
    '.gc-rp-hd b{font-size:17px;flex:1}.gc-rp-x{border:none;background:#e2e8f0;border-radius:8px;min-width:36px;height:34px;font-size:16px;font-weight:800;cursor:pointer;color:#0f172a}' +
    '.gc-rp-bd{padding:12px 16px 18px}.gc-rp-k{font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 6px}' +
    '.gc-rp-types{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.gc-rp-types button{border:1.5px solid #cbd5e1;background:#fff;border-radius:10px;padding:11px 8px;font:700 13.5px inherit;font-family:inherit;cursor:pointer;color:#1e293b;min-height:48px}' +
    '.gc-rp-types button.on{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.gc-rp-ta{width:100%;min-height:96px;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font:15px inherit;font-family:inherit;resize:vertical}' +
    '.gc-rp-in{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font:15px inherit;font-family:inherit}' +
    '.gc-rp-note{font-size:12.5px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;line-height:1.45}' +
    '.gc-rp-btn{border:none;border-radius:10px;padding:11px 16px;font:800 14px inherit;font-family:inherit;cursor:pointer;background:#2563eb;color:#fff}.gc-rp-btn[disabled]{opacity:.5;cursor:default}' +
    '.gc-rp-btn.ghost{background:#fff;color:#1d4ed8;border:1px solid #bfdbfe}.gc-rp-btn.ok{background:#16a34a}.gc-rp-btn.sm{padding:7px 11px;font-size:12.5px}' +
    '.gc-rp-msg{font-size:13px;margin-top:8px;min-height:18px}.gc-rp-msg.bad{color:#b91c1c}.gc-rp-msg.good{color:#166534}' +
    '.gc-rp-shot{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.gc-rp-shot img{max-width:120px;max-height:90px;border-radius:8px;border:1px solid #e2e8f0}' +
    '.gc-rp-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.gc-rp-tabs button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:6px 12px;font:700 12.5px inherit;font-family:inherit;cursor:pointer}.gc-rp-tabs button.on{background:#0f2440;color:#fff;border-color:#0f2440}' +
    '.gc-rp-it{border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin-bottom:10px}.gc-rp-it.open{border-left:4px solid #dc2626}.gc-rp-it.answered{border-left:4px solid #f59e0b}.gc-rp-it.fixed{border-left:4px solid #16a34a}' +
    '.gc-rp-it .h{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:#475569}.gc-rp-it .h b{color:#0f172a;font-size:13.5px}.gc-rp-it .tx{margin:6px 0;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.gc-rp-it .m{font-size:12px;color:#64748b;overflow-wrap:anywhere}.gc-rp-chip{font-size:11px;font-weight:800;border-radius:999px;padding:2px 8px;background:#f1f5f9;color:#334155;white-space:nowrap}' +
    '.gc-rp-chip.open{background:#fee2e2;color:#b91c1c}.gc-rp-chip.answered{background:#fef3c7;color:#92400e}.gc-rp-chip.fixed{background:#dcfce7;color:#166534}' +
    '.gc-rp-rep{background:#f8fafc;border-radius:8px;padding:7px 9px;margin:6px 0;font-size:13.5px;white-space:pre-wrap;overflow-wrap:anywhere}.gc-rp-rep small{display:block;color:#64748b;font-size:11.5px}' +
    '.gc-rp-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}.gc-rp-diag{font:11.5px ui-monospace,Menlo,Consolas,monospace;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:8px;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '#gc-rp-hub{background:#fff1f2!important;border:1px solid #fecdd3!important;border-radius:8px!important;margin:0 6px 6px!important;color:#9f1239!important;font-weight:800!important}' +
    '.gc-rp-n{background:#dc2626;color:#fff;border-radius:999px;font-size:11px;font-weight:800;padding:1px 7px;margin-left:auto}' +
    '#gc-rp-q{flex:0 0 auto;width:34px;height:34px;border-radius:50%;border:1px solid #fecdd3;background:#fff1f2;color:#be123c;font-size:16px;line-height:1;cursor:pointer;min-height:0!important;padding:0}' +
    '#gc-rp-notice{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(22px + env(safe-area-inset-bottom,0px));z-index:2147482000;width:min(520px,calc(100vw - 24px));background:#0f2440;color:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 10px 36px rgba(0,0,0,.35);font:14px Inter,-apple-system,Segoe UI,Arial,sans-serif}' +
    'html._fieldmode #gc-rp-notice{bottom:calc(86px + env(safe-area-inset-bottom,0px))}#gc-rp-notice .t{font-weight:800;margin-bottom:4px}#gc-rp-notice .r{font-size:13.5px;opacity:.95;max-height:3.9em;overflow:hidden;overflow-wrap:anywhere}' +
    '#gc-rp-notice .b{display:flex;gap:8px;margin-top:8px}#gc-rp-notice button{border:none;border-radius:8px;padding:8px 12px;font:800 13px inherit;font-family:inherit;cursor:pointer}' +
    '#gc-rp-signin{display:block;margin:6px auto 0;background:none;border:none;color:#b91c1c;font-size:13px;font-weight:700;cursor:pointer;padding:4px 6px;text-decoration:underline}' +
    '@media (max-width:600px){.gc-rp-ov{padding:0;align-items:stretch}.gc-rp-card,.gc-rp-card.wide{max-width:none;max-height:none;height:100%;border-radius:0}}';
  D.head.appendChild(st);
}
function toast(t, bad){
  try { var el = D.createElement('div'); el.id = 'gc-rp-toast'; el.setAttribute('data-gc-keep', '1'); el.textContent = t;
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483600;background:' + (bad ? '#b91c1c' : '#14532d') + ';color:#fff;padding:11px 16px;border-radius:10px;font:700 14px Inter,Arial,sans-serif;max-width:92vw;box-shadow:0 6px 24px rgba(0,0,0,.3)';
    var o = D.getElementById('gc-rp-toast'); if (o) o.remove(); D.body.appendChild(el); later(function(){ el.remove(); }, 4200); } catch (e) {}
}
var OPEN = [];
function modal(id, title, wide){
  css();
  var old = D.getElementById(id); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = id; ov.className = 'gc-rp-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gcnav-ignore', '1');
  ov.innerHTML = '<div class="gc-rp-card' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="gc-rp-hd"><b>' + esc(title) + '</b><button type="button" class="gc-rp-x" aria-label="Close">✕</button></div><div class="gc-rp-bd"></div></div>';
  var close = function(){ ov.remove(); OPEN = OPEN.filter(function(x){ return x !== ov; }); };
  ov.querySelector('.gc-rp-x').onclick = close;
  ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
  ov.__close = close;
  if (ov.id === 'gc-rp-signout') ov.style.zIndex = '2147483647';   /* over the sign-in screen (it is the top-most layer there) */
  D.body.appendChild(ov); OPEN.push(ov);
  return { ov: ov, bd: ov.querySelector('.gc-rp-bd'), close: close };
}
D.addEventListener('keydown', function(e){ if (e.key === 'Escape' && OPEN.length) { var o = OPEN[OPEN.length - 1]; if (o && o.__close) { o.__close(); e.stopPropagation(); } } }, true);

/* ═════ the form ═════ */
var CTX = null;
function capture(){ CTX = { screen: screenNow(), view: view(), app: app(), at: Date.now() }; return CTX; }
function open(pre){
  if (!signedIn()) { signedOutForm(); return null; }
  var c = (pre && pre.screen) ? pre : capture();
  var M = modal('gc-rp-form', '🆘 Report a problem / Ask a question');
  var st = { type: '', shot: '', busy: false };
  M.bd.innerHTML = '<div class="gc-rp-k">What is it?</div><div class="gc-rp-types">' + TYPES.map(function(t){ return '<button type="button" data-rp-type="' + t.k + '">' + t.ic + ' ' + esc(t.l) + '</button>'; }).join('') + '</div>' +
    '<div class="gc-rp-k">Tell us in a few words</div><textarea class="gc-rp-ta" maxlength="1500" placeholder="What happened, or what you want to know…"></textarea>' +
    '<div class="gc-rp-k">Screenshot or photo (optional)</div><div class="gc-rp-shot"><label class="gc-rp-btn ghost sm" style="display:inline-block">📷 Add a picture<input type="file" accept="image/*" style="display:none"></label><span class="pv"></span></div>' +
    '<div class="gc-rp-k">Sent with it</div><div class="gc-rp-note">📍 Screen: <b>' + esc(c.screen || '—') + '</b><br>📱 This ' + esc(kind()) + ' · ' + (c.app === 'field' ? 'GrayCo Field' : 'Desk') + ' · version ' + esc(build() || '?') + '<br>🧾 Its last page errors and slow taps (up to 20) — no passwords, nothing you typed elsewhere.</div>' +
    '<div class="gc-rp-row"><button type="button" class="gc-rp-btn" data-rp-send>Send to the office</button>' + (canList() ? '<button type="button" class="gc-rp-btn ghost sm" data-rp-list>🆘 Problem reports</button>' : '') + '<button type="button" class="gc-rp-btn ghost sm" data-rp-mine>My reports</button></div><div class="gc-rp-msg"></div>';
  var msg = M.bd.querySelector('.gc-rp-msg'), ta = M.bd.querySelector('textarea'), send = M.bd.querySelector('[data-rp-send]');
  var say = function(t, cls){ msg.textContent = t; msg.className = 'gc-rp-msg ' + (cls || ''); };
  Array.prototype.forEach.call(M.bd.querySelectorAll('[data-rp-type]'), function(b){ b.onclick = function(){ st.type = b.getAttribute('data-rp-type'); Array.prototype.forEach.call(M.bd.querySelectorAll('[data-rp-type]'), function(x){ x.classList.toggle('on', x === b); }); say(''); if (st.type === 'question' && !ta.value) ta.placeholder = 'Your question…'; }; });
  M.bd.querySelector('input[type=file]').onchange = function(){
    var f = this.files && this.files[0]; if (!f) return; say('Making the picture small…');
    shrink(f).then(function(d){ st.shot = d; M.bd.querySelector('.pv').innerHTML = '<img alt="Your picture" src="' + d + '"> <button type="button" class="gc-rp-btn ghost sm" data-rp-noshot>Remove</button>'; M.bd.querySelector('[data-rp-noshot]').onclick = function(){ st.shot = ''; M.bd.querySelector('.pv').innerHTML = ''; }; say(''); }, function(e){ say(e.message || 'That picture could not be used.', 'bad'); });
  };
  var lb = M.bd.querySelector('[data-rp-list]'); if (lb) lb.onclick = function(){ M.close(); list(); };
  M.bd.querySelector('[data-rp-mine]').onclick = function(){ M.close(); mine(); };
  send.onclick = function(){
    if (st.busy) return;
    if (!st.type) { say('Pick what it is first (Something broke, Can\'t find something, Question or Idea).', 'bad'); return; }
    if (s(ta.value).length < 3) { say('Write a few words about it.', 'bad'); ta.focus(); return; }
    st.busy = true; send.disabled = true; say('Sending…');
    submit({ type: st.type, text: s(ta.value).slice(0, 1500), ctx: c, shot: st.shot }).then(function(r){
      st.busy = false; send.disabled = false;
      if (r.ok) { M.bd.innerHTML = '<div style="text-align:center;padding:18px 6px"><div style="font-size:40px">✅</div><div style="font-size:17px;font-weight:800;margin:6px 0">Sent — thank you.</div><div class="gc-rp-note" style="text-align:left">' + (r.queued ? 'No signal right now: it is saved on this device and goes to the office by itself when you are back online.' : 'The office has it' + (r.told ? ' and was notified' : '') + '. When someone answers, you will see the answer here in the CRM' + (r.told ? ' (and on your phone if notifications are on)' : '') + '.') + '</div><div class="gc-rp-row" style="justify-content:center"><button type="button" class="gc-rp-btn" data-rp-done>Done</button></div></div>'; M.bd.querySelector('[data-rp-done]').onclick = M.close; }
      else say(r.error || 'Could not send — try again.', 'bad');
    });
  };
  later(function(){ try { M.bd.querySelector('[data-rp-type]').focus(); } catch (e) {} }, 30);
  return M.ov;
}
function newId(){ return 'PR' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function record(o){
  var at = nowIso(), u = me();
  return { id: newId(), at: at, updatedAt: at, type: o.type, text: o.text, screen: s(o.ctx && o.ctx.screen), view: s(o.ctx && o.ctx.view), app: s(o.ctx && o.ctx.app) || app(), kind: kind(), build: build(), dev: devId(),
    by: { email: myEmail(), name: myName(), role: s(u && u.role) }, status: 'open', replies: [], via: 'crm', shot: o.shot ? true : undefined, diagN: 0 };
}
/* signed-in staff: straight into gc_kv; the Marketing Manager (no gc_kv): the function, with his sign-in */
function submit(o){
  var dg = diag();
  if (isMM()) {
    return fnCall({ op: 'submit', dev: devId(), report: { type: o.type, text: o.text, screen: s(o.ctx.screen), view: s(o.ctx.view), app: s(o.ctx.app), kind: kind(), build: build(), ua: s(navigator.userAgent).slice(0, 200), name: myName(), diag: dg }, shot: o.shot || undefined })
      .then(function(j){ if (j && j.ok) { remember({ id: j.id, at: nowIso(), type: o.type, text: o.text, status: 'open' }); return { ok: true, told: !!(j.told && j.told.to) }; } return { ok: false, error: s(j && j.error) || 'Could not send — try again.' }; });
  }
  var rec = record(o); rec.diagN = dg.length;
  var det = { id: rec.id, at: rec.at, diag: dg, ua: s(navigator.userAgent).slice(0, 200) };
  return deliver(rec, det, o.shot).then(function(ok){
    if (!ok) { var q = jget(OUTBOX, []); q.push({ rec: rec, det: det, shot: o.shot && o.shot.length < 250e3 ? o.shot : '' }); if (!o.shot || o.shot.length >= 250e3) rec.shot = undefined; jset(OUTBOX, q.slice(-10)); remember(rec); return { ok: true, queued: true }; }
    remember(rec);
    return tell(rec).then(function(t){ return { ok: true, told: t }; });
  });
}
function deliver(rec, det, shot){
  return Promise.resolve(shot ? kvWrite(SHOT + rec.id, { id: rec.id, at: rec.at, data: shot }) : true).then(function(okShot){
    if (!okShot) return false;
    return kvWrite(DETAIL + rec.id, det).then(function(okD){
      if (!okD) return false;
      return listUpdate(KEY, function(l){ return l.some(function(x){ return x.id === rec.id; }) ? null : l.concat([rec]); }, function(l){ return l.some(function(x){ return x.id === rec.id; }); });
    });
  });
}
function tell(rec){
  var to = recipients();
  if (!to.length || typeof W._gcNotify !== 'function') return Promise.resolve(false);
  var title = ('🆘 ' + (TYPE_L[rec.type] || 'Problem report').replace(/^\S+\s/, '') + ' — ' + s(rec.by && rec.by.name)).slice(0, 120);
  return Promise.resolve(W._gcNotify(to, { kind: 'problem', link: '#problems=' + rec.id, title: title, body: clip(rec.text, 200) + (rec.screen ? ' · ' + clip(rec.screen, 60) : '') }))
    .then(function(r){ return !!(r && r.ok !== false); }, function(){ return false; });
}
function remember(rec){ var l = jget(MINE, []).filter(function(x){ return x && x.id !== rec.id; }); l.unshift({ id: rec.id, at: rec.at, type: rec.type, text: clip(rec.text, 200), status: rec.status || 'open' }); jset(MINE, l.slice(0, 30)); }
/* no signal: what waits on this device goes when it can */
var flushing = false;
function flushOutbox(){
  var q = jget(OUTBOX, []); if (!q.length || flushing || !signedIn() || navigator.onLine === false) return;
  flushing = true;
  var x = q[0];
  deliver(x.rec, x.det, x.shot).then(function(ok){
    flushing = false; if (!ok) return;
    jset(OUTBOX, jget(OUTBOX, []).filter(function(y){ return y && y.rec && y.rec.id !== x.rec.id; }));
    tell(x.rec); later(flushOutbox, 500);
  }, function(){ flushing = false; });
}

/* ═════ signed out: "Can't sign in? Report it" ═════ */
function gateText(){ var m = D.getElementById('gc-auth-msg'); return clip(m && m.textContent, 200); }
function signedOutForm(){
  var M = modal('gc-rp-signout', "🔑 Can't sign in? Report it");
  var st = { shot: '', busy: false };
  M.bd.innerHTML = '<div class="gc-rp-note">The office gets this right away and will call you back. Please do not type your password here.</div>' +
    '<div class="gc-rp-k">Your name</div><input class="gc-rp-in" data-rp-name autocomplete="name" maxlength="60">' +
    '<div class="gc-rp-k">Phone we can call you on</div><input class="gc-rp-in" data-rp-phone type="tel" autocomplete="tel" maxlength="20">' +
    '<div class="gc-rp-k">What happens when you try to sign in?</div><textarea class="gc-rp-ta" maxlength="1500" placeholder="e.g. it says wrong password / it keeps spinning / the screen is blank…"></textarea>' +
    '<div class="gc-rp-k">Screenshot or photo (optional)</div><div class="gc-rp-shot"><label class="gc-rp-btn ghost sm" style="display:inline-block">📷 Add a picture<input type="file" accept="image/*" style="display:none"></label><span class="pv"></span></div>' +
    '<div class="gc-rp-note" style="margin-top:10px">Sent with it: this ' + esc(kind()) + ', the version (' + esc(build() || '?') + ')' + (gateText() ? ', and what the sign-in screen says: “' + esc(gateText()) + '”' : '') + '.</div>' +
    '<div class="gc-rp-row"><button type="button" class="gc-rp-btn" data-rp-send>Send to the office</button></div><div class="gc-rp-msg"></div>';
  var msg = M.bd.querySelector('.gc-rp-msg'), send = M.bd.querySelector('[data-rp-send]');
  var say = function(t, cls){ msg.textContent = t; msg.className = 'gc-rp-msg ' + (cls || ''); };
  M.bd.querySelector('input[type=file]').onchange = function(){ var f = this.files && this.files[0]; if (!f) return; say('Making the picture small…'); shrink(f).then(function(d){ st.shot = d; M.bd.querySelector('.pv').innerHTML = '<img alt="Your picture" src="' + d + '">'; say(''); }, function(e){ say(e.message, 'bad'); }); };
  send.onclick = function(){
    if (st.busy) return;
    var name = s(M.bd.querySelector('[data-rp-name]').value), phone = s(M.bd.querySelector('[data-rp-phone]').value), text = s(M.bd.querySelector('textarea').value);
    if (name.length < 2) { say('Type your name.', 'bad'); return; }
    if (phone.replace(/\D/g, '').length < 7) { say('Type a phone number we can call you on.', 'bad'); return; }
    st.busy = true; send.disabled = true; say('Sending…');
    fnCall({ op: 'submit', dev: devId(), report: { type: 'signin', text: text.slice(0, 1500), name: name, phone: phone, screen: 'Sign-in screen', app: app(), kind: kind(), build: build(), ua: s(navigator.userAgent).slice(0, 200), gate: gateText(), diag: diag() }, shot: st.shot || undefined })
      .then(function(j){
        st.busy = false; send.disabled = false;
        if (j && j.ok) { M.bd.innerHTML = '<div style="text-align:center;padding:18px 6px"><div style="font-size:40px">✅</div><div style="font-size:17px;font-weight:800;margin:6px 0">Sent — the office will call you.</div><div class="gc-rp-note">If it is urgent, call the office too.</div><div class="gc-rp-row" style="justify-content:center"><button type="button" class="gc-rp-btn" data-rp-done>Done</button></div></div>'; M.bd.querySelector('[data-rp-done]').onclick = M.close; return; }
        say(s(j && j.error) || 'Could not send — try again.', 'bad');
      });
  };
  return M.ov;
}
function gateLink(){
  var fg = D.getElementById('gc-auth-forgot'); if (!fg || D.getElementById('gc-rp-signin') || !visible(fg)) return;
  css();
  var b = D.createElement('button'); b.type = 'button'; b.id = 'gc-rp-signin'; b.textContent = "Can't sign in? Report it";
  b.onclick = function(e){ e.preventDefault(); signedOutForm(); };
  fg.parentNode.insertBefore(b, fg.nextSibling);
}

/* ═════ 🆘 Problem reports (admins and the office) ═════ */
var LIST = { at: 0, items: null, tab: 'open', busy: null };
function loadList(force){
  if (!force && LIST.items && Date.now() - LIST.at < 60e3) return Promise.resolve(LIST.items);
  if (LIST.busy) return LIST.busy;
  LIST.busy = kvRead(KEY).then(function(r){ LIST.busy = null; if (r && (r.value == null || Array.isArray(r.value))) { LIST.items = arr(r.value); LIST.at = Date.now(); } return LIST.items; }, function(){ LIST.busy = null; return LIST.items; });
  return LIST.busy;
}
function openCount(){ return arr(LIST.items).filter(function(x){ return x.status === 'open'; }).length; }
function who(x){ var b = x.by || {}; return x.signedOut ? esc(b.name || 'Someone') + ' <span class="gc-rp-chip">signed out</span>' + (b.phone ? ' · <a href="tel:' + esc(b.phone) + '">📞 ' + esc(b.phone) + '</a> · <a href="sms:' + esc(b.phone) + '">💬 Text</a>' : '') : esc(b.name || b.email || '?') + (b.role ? ' · ' + esc(b.role) : ''); }
function itemHtml(x, canAct){
  var reps = arr(x.replies).map(function(r){ return '<div class="gc-rp-rep"><small>' + esc(r.by || 'Office') + ' · ' + esc(when(r.at)) + (r.fix ? ' · ✓ marked fixed' : '') + '</small>' + esc(r.text) + '</div>'; }).join('');
  var dev = [x.kind, x.app === 'field' ? 'GrayCo Field' : x.app === 'desk' ? 'Desk' : '', x.build ? 'v' + x.build : ''].filter(Boolean).join(' · ');
  return '<div class="gc-rp-it ' + esc(x.status || 'open') + '" data-rp-id="' + esc(x.id) + '"><div class="h"><span class="gc-rp-chip">' + esc(TYPE_L[x.type] || x.type) + '</span><b>' + who(x) + '</b><span>' + esc(ago(x.at)) + '</span><span class="gc-rp-chip ' + esc(x.status) + '" style="margin-left:auto">' + esc(x.status || 'open') + '</span></div>' +
    (x.text ? '<div class="tx">' + esc(x.text) + '</div>' : '') +
    '<div class="m">📍 ' + esc(x.screen || '—') + (dev ? ' · 📱 ' + esc(dev) : '') + ' · ' + esc(when(x.at)) + '</div>' + reps +
    '<div class="gc-rp-row">' + (x.shot ? '<button type="button" class="gc-rp-btn ghost sm" data-rp-a="shot">📷 Photo</button>' : '') + '<button type="button" class="gc-rp-btn ghost sm" data-rp-a="diag">🧾 Errors & slow taps' + (x.diagN != null ? ' (' + (+x.diagN || 0) + ')' : '') + '</button></div><div class="gc-rp-more"></div>' +
    (canAct ? '<textarea class="gc-rp-ta" data-rp-ans style="min-height:60px;margin-top:8px" maxlength="1500" placeholder="' + (x.signedOut ? 'A note (they are signed out — call or text them; this is kept on the report)' : 'Your answer — ' + esc(s(x.by && x.by.name).split(' ')[0] || 'they') + ' sees it in the CRM') + '"></textarea>' +
      '<div class="gc-rp-row"><button type="button" class="gc-rp-btn sm" data-rp-a="answer">' + (x.signedOut ? 'Save the note' : 'Send answer') + '</button>' + (x.status === 'fixed' ? '<button type="button" class="gc-rp-btn ghost sm" data-rp-a="reopen">Reopen</button>' : '<button type="button" class="gc-rp-btn ok sm" data-rp-a="fixed">✓ Mark fixed</button>') + '<span class="gc-rp-msg" style="margin:0"></span></div>' : '') +
    '</div>';
}
function list(focusId){
  if (!canList()) { toast('Problem reports are for the admins and the office.', true); return null; }
  var M = modal('gc-rp-list', '🆘 Problem reports', true);
  if (focusId) LIST.tab = 'all';
  var paint = function(){
    var L = arr(LIST.items).slice().sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); });
    var n = { open: 0, answered: 0, fixed: 0 }; L.forEach(function(x){ n[x.status] = (n[x.status] || 0) + 1; });
    var show = LIST.tab === 'all' ? L : L.filter(function(x){ return (x.status || 'open') === LIST.tab; });
    M.bd.innerHTML = '<div class="gc-rp-tabs">' + [['open', 'Open'], ['answered', 'Answered'], ['fixed', 'Fixed'], ['all', 'All']].map(function(t){ return '<button type="button" data-rp-tab="' + t[0] + '" class="' + (LIST.tab === t[0] ? 'on' : '') + '">' + t[1] + ' (' + (t[0] === 'all' ? L.length : n[t[0]] || 0) + ')</button>'; }).join('') + '<button type="button" data-rp-tab="refresh" style="margin-left:auto">↻</button></div>' +
      (LIST.items === null ? '<div class="gc-rp-note">Could not read the reports — check the connection and tap ↻.</div>' : show.length ? show.map(function(x){ return itemHtml(x, true); }).join('') : '<div class="gc-rp-note">Nothing here' + (LIST.tab === 'open' ? ' — no open reports. 🎉' : '.') + '</div>') +
      '<div class="gc-rp-note" style="margin-top:6px">Reports are kept for good (never deleted). The reporter sees each answer as a notice in the CRM.</div>';
    if (focusId) { var el = M.bd.querySelector('[data-rp-id="' + focusId.replace(/[^A-Za-z0-9_-]/g, '') + '"]'); if (el) { el.style.outline = '3px solid #f59e0b'; later(function(){ try { el.scrollIntoView({ block: 'center' }); } catch (e) {} }, 50); } focusId = ''; }
  };
  M.bd.innerHTML = '<div class="gc-rp-note">Loading…</div>';
  loadList(true).then(paint);
  M.bd.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var tb = t.closest('[data-rp-tab]');
    if (tb) { var k = tb.getAttribute('data-rp-tab'); if (k === 'refresh') loadList(true).then(paint); else { LIST.tab = k; paint(); } return; }
    var b = t.closest('[data-rp-a]'); if (!b) return;
    var card = b.closest('[data-rp-id]'), id = card && card.getAttribute('data-rp-id'), a = b.getAttribute('data-rp-a');
    var x = arr(LIST.items).filter(function(y){ return y.id === id; })[0]; if (!x) return;
    var more = card.querySelector('.gc-rp-more'), msg = card.querySelector('.gc-rp-msg');
    if (a === 'shot') { more.innerHTML = '<div class="gc-rp-note">Loading the photo…</div>'; kvRead(SHOT + id).then(function(r){ var d = r && r.value && r.value.data; more.innerHTML = d && /^data:image\//.test(d) ? '<a href="' + d + '" target="_blank" rel="noopener"><img alt="The photo" src="' + d + '" style="max-width:100%;max-height:420px;border-radius:10px;border:1px solid #e2e8f0;margin-top:6px"></a>' : '<div class="gc-rp-note">The photo is not there (it may still be on its way).</div>'; }); return; }
    if (a === 'diag') { more.innerHTML = '<div class="gc-rp-note">Loading…</div>'; kvRead(DETAIL + id).then(function(r){ var v = (r && r.value) || {}; var dg = arr(v.diag); more.innerHTML = '<div class="gc-rp-diag">' + (dg.length ? dg.map(function(d){ return esc((d.k === 'slow' ? '🐢 ' + (d.ms || '?') + ' ms ' : d.k === 'net' ? '📡 ' : '⚠ ') + d.t + (d.n > 1 ? ' ×' + d.n : '') + (d.v ? '  [' + d.v + ']' : '') + (d.at ? '  ' + when(d.at) : '')); }).join('\n') : 'No page errors or slow taps on that device. 👍') + (v.gate ? '\n\nSign-in screen said: ' + esc(v.gate) : '') + (v.ua ? '\n\n' + esc(v.ua) : '') + '</div>'; }); return; }
    var ans = card.querySelector('[data-rp-ans]'), text = s(ans && ans.value);
    if (a === 'answer' && text.length < 2) { msg.textContent = 'Write the answer first.'; msg.className = 'gc-rp-msg bad'; return; }
    b.disabled = true; msg.textContent = 'Saving…'; msg.className = 'gc-rp-msg';
    act(x, a, text).then(function(r){ b.disabled = false; if (!r.ok) { msg.textContent = r.error || 'Could not save — try again.'; msg.className = 'gc-rp-msg bad'; return; } paint(); toast(a === 'answer' ? (x.signedOut ? 'Note saved.' : 'Answer sent — it is under Answered now.') : a === 'fixed' ? 'Marked fixed — it is under Fixed now.' : 'Reopened.'); });
  });
  return M.ov;
}
/* answer / fixed / reopen: one record changes (newest wins), nothing else; the reporter is told */
function act(x, a, text){
  var at = nowIso(), mine0 = myName(), rec = null;
  var change = function(r){
    r = JSON.parse(JSON.stringify(r)); r.updatedAt = at; r.replies = arr(r.replies);
    if (a === 'answer') { r.replies.push({ at: at, by: mine0, email: myEmail(), text: text.slice(0, 1500) }); if (r.status !== 'fixed') r.status = 'answered'; }
    if (a === 'fixed') { r.status = 'fixed'; r.fixedAt = at; r.fixedBy = mine0; if (text) r.replies.push({ at: at, by: mine0, email: myEmail(), text: text.slice(0, 1500), fix: true }); }
    if (a === 'reopen') { r.status = r.replies.length ? 'answered' : 'open'; r.fixedAt = undefined; }
    return r;
  };
  return listUpdate(KEY, function(l){ var i = -1; l.forEach(function(y, j){ if (y.id === x.id) i = j; }); if (i < 0) return null; rec = change(l[i]); l[i] = rec; return l; },
    function(l){ return l.some(function(y){ return y.id === x.id && s(y.updatedAt) >= at; }); })
    .then(function(ok){
      if (!ok || !rec) return { ok: false, error: 'Could not save — try again.' };
      LIST.items = arr(LIST.items).map(function(y){ return y.id === rec.id ? rec : y; });
      var to = low(rec.by && rec.by.email);
      if (!rec.signedOut && to && a !== 'reopen') {
        var note = { id: 'N' + Date.now().toString(36), rid: rec.id, at: at, by: mine0, text: (a === 'fixed' ? '✓ Marked fixed' + (text ? ' — ' + text : '') : text).slice(0, 1500), type: rec.type, about: clip(rec.text, 140), status: rec.status, seen: false };
        listUpdate(INBOX + slug(to), function(l){ return l.concat([note]).slice(-50); }, function(l){ return l.some(function(y){ return y.id === note.id; }); });
        try { if (typeof W._gcNotify === 'function' && to !== myEmail()) W._gcNotify(to, { kind: 'problem', link: '#myproblems', title: (a === 'fixed' ? '✓ Fixed: ' : '💬 Answer to your report: ') + clip(rec.text, 60), body: clip(note.text, 200) + ' — ' + mine0 }); } catch (e) {}
      }
      return { ok: true };
    });
}

/* ═════ the reporter: answers as a CRM notice ═════ */
var INB = { items: [], at: 0, shown: '' }, SEEN = {};   /* SEEN: marked seen here (a read that was already on its way does not bring the notice back) */
function checkInbox(){
  if (!signedIn() || isMM()) return Promise.resolve([]);
  return kvRead(INBOX + slug(myEmail())).then(function(r){ if (r && (r.value == null || Array.isArray(r.value))) { INB.items = arr(r.value); INB.at = Date.now(); notice(); } return INB.items; });
}
function unseen(){ return INB.items.filter(function(n){ return n.seen !== true && !SEEN[n.id]; }); }
function notice(){
  var u = unseen(), old = D.getElementById('gc-rp-notice');
  if (!u.length || D.getElementById('gc-auth-email')) { if (old) old.remove(); return; }
  var n = u[u.length - 1], sig = n.id + ':' + u.length;
  if (old && old.getAttribute('data-sig') === sig) return;
  css(); if (old) old.remove();
  var el = D.createElement('div'); el.id = 'gc-rp-notice'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('data-sig', sig); el.setAttribute('role', 'status');
  el.innerHTML = '<div class="t">' + (n.status === 'fixed' ? '✓ ' : '💬 ') + esc(n.by || 'The office') + ' answered your problem report' + (u.length > 1 ? ' (+' + (u.length - 1) + ' more)' : '') + '</div><div class="r">' + esc(n.text) + '</div>' +
    '<div class="b"><button type="button" data-rp-n="open" style="background:#fff;color:#0f2440">Open</button><button type="button" data-rp-n="ok" style="background:#1e3a5f;color:#fff">Got it</button></div>';
  el.querySelector('[data-rp-n="open"]').onclick = function(){ markSeen(); mine(); };
  el.querySelector('[data-rp-n="ok"]').onclick = function(){ markSeen(); };
  D.body.appendChild(el);
}
function markSeen(){
  var ids = unseen().map(function(n){ return n.id; }); var el = D.getElementById('gc-rp-notice'); if (el) el.remove();
  if (!ids.length) return;
  INB.items.forEach(function(n){ if (ids.indexOf(n.id) >= 0) { n.seen = true; SEEN[n.id] = 1; } });
  listUpdate(INBOX + slug(myEmail()), function(l){ var ch = false; l.forEach(function(n){ if (ids.indexOf(n.id) >= 0 && n.seen !== true) { n.seen = true; n.seenAt = nowIso(); ch = true; } }); return ch ? l : null; }, function(l){ return l.every(function(n){ return ids.indexOf(n.id) < 0 || n.seen === true; }); });
}
function mine(){
  var M = modal('gc-rp-mine', '🆘 My problem reports');
  var paint = function(){
    var L = jget(MINE, []), byR = {};
    INB.items.forEach(function(n){ (byR[n.rid] = byR[n.rid] || []).push(n); });
    var ids = L.map(function(x){ return x.id; }); Object.keys(byR).forEach(function(r){ if (ids.indexOf(r) < 0) { var n0 = byR[r][0]; L.push({ id: r, at: n0.at, type: n0.type, text: n0.about, status: n0.status }); } });
    L.sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); });
    M.bd.innerHTML = (L.length ? L.map(function(x){ var ns = byR[x.id] || [], st = ns.length ? ns[ns.length - 1].status || 'answered' : x.status || 'open';
      return '<div class="gc-rp-it ' + esc(st) + '"><div class="h"><span class="gc-rp-chip">' + esc(TYPE_L[x.type] || x.type) + '</span><span>' + esc(ago(x.at)) + '</span><span class="gc-rp-chip ' + esc(st) + '" style="margin-left:auto">' + esc(st === 'open' ? 'waiting for an answer' : st) + '</span></div><div class="tx">' + esc(x.text) + '</div>' +
        ns.map(function(n){ return '<div class="gc-rp-rep"><small>' + esc(n.by) + ' · ' + esc(when(n.at)) + '</small>' + esc(n.text) + '</div>'; }).join('') + '</div>'; }).join('') : '<div class="gc-rp-note">No reports from you yet.</div>') +
      '<div class="gc-rp-row"><button type="button" class="gc-rp-btn" data-rp-new>🆘 Report a problem / Ask a question</button></div>';
    M.bd.querySelector('[data-rp-new]').onclick = function(){ M.close(); open(); };
  };
  paint(); checkInbox().then(paint);
  return M.ov;
}

/* ═════ where it shows ═════ */
function pinned(){ return ymdC() < PIN_UNTIL; }
function hubItem(panel){
  if (!panel || !signedIn() || panel.querySelector('[data-gcrp-hub]')) return;
  css();
  var it = D.createElement('div'); it.id = 'gc-rp-hub'; it.className = 'gc-hub-item'; it.setAttribute('data-gcrp-hub', '1'); it.setAttribute('data-label', 'Report a problem / Ask a question');
  it.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;cursor:pointer;font-size:13px';
  it.innerHTML = '<span class="gc-hub-icon" style="font-size:18px">🆘</span><span>Report a problem / Ask a question</span>';
  it.onclick = function(){ var c = capture(); later(function(){ open(c); }, 0); };
  if (pinned()) panel.insertBefore(it, panel.firstChild);
  else { it.id = 'gc-rp-hub-n'; it.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9'; panel.appendChild(it); }
  if (canList() && !panel.querySelector('#gc-rp-hub-list')) {
    var l = D.createElement('div'); l.id = 'gc-rp-hub-list'; l.className = 'gc-hub-item'; l.setAttribute('data-label', 'Problem reports');
    l.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9';
    var n = openCount();
    l.innerHTML = '<span style="font-size:18px">🆘</span><span>Problem reports</span>' + (n ? '<span class="gc-rp-n">' + n + '</span>' : '');
    l.onclick = function(){ later(function(){ list(); }, 0); };
    panel.appendChild(l);
  }
}
/* pinned: it stays the first thing in the menu (other items that put themselves on top come in after it) */
function keepFirst(panel){ var it = panel && panel.querySelector('#gc-rp-hub'); if (it && panel.firstChild !== it) panel.insertBefore(it, panel.firstChild); }
D.addEventListener('gc-hub-open', function(e){ try { var p = e && e.detail && e.detail.panel; hubItem(p); later(function(){ keepFirst(p); }, 0); later(function(){ keepFirst(p); }, 200); } catch (x) { warn(x); } });
function hubPoll(){ var all = D.querySelectorAll('.gc-hub-panel'); for (var i = 0; i < all.length; i++) if (all[i].getClientRects().length) { hubItem(all[i]); keepFirst(all[i]); break; } }
/* GrayCo Field ☰ More: the Office rows */
function moreRows(){
  var o = D.querySelector('.gc-fh-sheet[data-ra-more]'); if (!o || !signedIn()) return;
  var pk = o.querySelector('.pick'); if (!pk || pk.querySelector('[data-ra-a="gcrp"]')) return;
  css();
  var mk = function(k, ic, l){ var b = D.createElement('button'); b.type = 'button'; b.className = 'gc-fm-r'; b.setAttribute('data-ra-a', k); b.setAttribute('data-ra-close', ''); b.innerHTML = '<span class="e">' + ic + '</span><span>' + esc(l) + '</span>'; return b; };
  var before = pk.querySelector(':scope > [data-m="tools"]') || pk.querySelector(':scope > [data-m="settings"]') || null;
  pk.insertBefore(mk('gcrp', '🆘', 'Report a problem / Ask a question'), before);
  if (canList()) { var n = openCount(); var b2 = mk('gcrp-list', '🆘', 'Problem reports' + (n ? ' (' + n + ' open)' : '')); pk.insertBefore(b2, before); }
}
/* the Field home: a small ❓ in its top bar */
function fieldQ(){
  var top = D.querySelector('#_gcJobPick.gc-fh .fh-top'); if (!top || !signedIn() || top.querySelector('#gc-rp-q')) return;
  css();
  var b = D.createElement('button'); b.type = 'button'; b.id = 'gc-rp-q'; b.textContent = '❓'; b.title = 'Report a problem / Ask a question'; b.setAttribute('aria-label', 'Report a problem or ask a question');
  b.onclick = function(e){ e.stopPropagation(); open(); };
  top.appendChild(b);
}
/* Field ☰ More's buttons: ours run before the Field's own button handler (it stops every click it does not know) */
W.addEventListener('click', function(e){
  var t = e.target, b = t && t.closest ? t.closest('[data-ra-a="gcrp"],[data-ra-a="gcrp-list"]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  var sh = b.closest('.gc-fh-sheet,.gc-ra-sheet'); var c = capture(); if (sh) sh.remove();
  if (b.getAttribute('data-ra-a') === 'gcrp') open(c); else list();
}, true);
W.addEventListener('click', function(e){ var t = e.target; if (t && t.closest && t.closest('#gc-fh-tabs [data-t="more"]')) { later(moreRows, 0); later(moreRows, 120); later(moreRows, 600); } }, true);
/* links from a phone notice: #problems=<id> (admins / office), #myproblems (the reporter) */
function hashOpen(){
  var h = s(location.hash); if (!signedIn()) return;
  var m = /^#problems(?:=([A-Za-z0-9_-]{1,40}))?$/.exec(h);
  if (m && canList()) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} list(m[1] || ''); return; }
  if (h === '#myproblems') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} mine(); }
}
W.addEventListener('hashchange', hashOpen);

var ticks = 0;
function tick(){
  ticks++;
  try {
    if (!signedIn()) { gateLink(); return; }
    hubPoll(); fieldQ(); moreRows();
    if (ticks % 3 === 0) notice();
  } catch (e) { warn(e); }
}
every(function(){ if (!D.hidden) tick(); }, 1500);
/* the reporter's answers: when the CRM opens, then every 4 min while they have a report that is not fixed (or an unseen answer) */
function wantsPoll(){ return unseen().length > 0 || jget(MINE, []).some(function(x){ return x && x.status !== 'fixed' && Date.now() - (Date.parse(x.at) || 0) < 30 * 864e5; }); }
var started = false;
function start(){
  if (started || !signedIn()) return; started = true;
  later(function(){ checkInbox(); flushOutbox(); if (canList()) loadList(false); hashOpen(); }, 6000);
  every(function(){ if (D.hidden || !signedIn()) return; if (wantsPoll()) checkInbox(); flushOutbox(); }, 4 * 60e3);
  every(function(){ if (D.hidden || !canList()) return; loadList(true); }, 10 * 60e3);
}
every(function(){ if (!started && signedIn()) start(); }, 2000);
later(function(){ if (signedIn()) start(); }, 500);
W.addEventListener('online', function(){ later(flushOutbox, 1500); });

W._gcReportProb = { open: function(){ return open(); }, list: list, mine: mine, signedOut: signedOutForm, checkInbox: checkInbox, loadList: loadList, diag: diag, screen: screenNow,
  state: function(){ return { signedIn: signedIn(), canList: canList(), pinned: pinned(), open: openCount(), items: arr(LIST.items).length, inbox: INB.items.length, unseen: unseen().length, outbox: jget(OUTBOX, []).length, mine: jget(MINE, []).length }; } };
try { console.log('[GC] 🆘 Report a problem (patch REPORTPROB): _gcReportProb.state()'); } catch (e) {}
})();
