/* patch OFFFEAT (owner 10/30): four office features for the office manager and the owners.
   (2) 📬 COLLECTIONS BOARD — unpaid client invoices by age: current (not due yet), 1–30, 31–60, 61–90, 90+ days past
       due, with totals per bucket, per customer and per job. The rows and the balance are ACCOUNTING'S OWN (patch K's
       counting rules, window._gcAcctRules: the same invoices, billed − collected, due date or else invoice date), so the
       total here is the total on Accounting → ⬇ Money In. Each row: "Send payment reminder" → ONE payment_reminder item
       on ✅ Approvals (office-board.js; nothing goes out until it is approved; one open reminder per invoice) and the
       last reminder date. Where: Accounting → 🏠 Home card and ⬇ Money In (the ✉ Remind column now goes through
       Approvals), the 🏢 Office page's "📋 What needs you today", and every old "Collections Desk" door
       (window._gcOpenCollectionsDesk opens this board).
   (3) SUB PAPERWORK — the 🛡 Sub Compliance board: "expires in N days / expired N days ago" chips, a COI running out
       within 30 days counts as needing papers, "⛔ Payment blocked" (the CRM's own rule: GL insurance current, workers'
       comp current or exempt, W-9 on file) and Request docs → ONE sub_doc_request on ✅ Approvals per sub (the request
       state shows on the row). The Subs tab's compliance table: the same chip under GL Ins and the reason under ⛔.
       The daily server run asks for COIs 30 / 7 / 0 days out and for a missing W-9 (also through Approvals).
   (4) ⚖️ LIENS & WAIVERS — 🧰 Job tools → "⚖️ Liens & waivers": the per-job switch "Track lien deadlines" (OFF by
       default) and, when on, the TN / AR / MS notice deadlines from the job's state, start date and last day of work
       (window._gcLienRules = netlify/functions/_lib/lien-deadlines.js, planning estimates, "confirm with your lawyer");
       mark each step done. Lien waivers per payment: GrayCo's conditional / unconditional waiver for each customer
       payment (lien_waiver through Approvals) and each sub payment's waiver (requested / waiting / received —
       sub_lien_request through Approvals, or marked received by hand). ✏️ Waiver wording: editable (admins + office).
       The office To-Do gets a reminder before each deadline (server, daily).
   (7) ✍️ UNSIGNED CHANGE ORDERS — 🧰 Job tools → "✍️ Unsigned COs": every change order sent and not signed, days
       waiting, Nudge → ONE reminder on ✅ Approvals per change order. The office To-Do gets one item per change order
       waiting 7+ days (server, daily).
   PERFORMANCE: no timers, no polling, no observers. Everything is computed when a screen opens (memoized on the lists
   it reads); the only network calls are the button presses and one read when a job panel opens. One click listener.
   Console: _gcOffFeat.collections() · _gcOffFeat.openCollections() · _gcOffFeat.liens(pid) · _gcOffFeat.cos(pid) */
(function(){
'use strict';
if (window.__GC_PATCH_OFFFEAT__) return; window.__GC_PATCH_OFFFEAT__ = true;
var W = window, D = document, FN = '/.netlify/functions/office-board', LIENFN = '/.netlify/functions/lien';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function n2(v){ var x = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
function r2(v){ return Math.round(n2(v) * 100) / 100; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(v){ var x = r2(v), t = '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return x < 0 ? '−' + t : t; }
function money0(v){ return '$' + Math.round(n2(v)).toLocaleString('en-US'); }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function ymdD(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today(){ return ymdD(new Date()); }
function day(v){ var t = s(v), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[0]; m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t); return m ? m[3] + '-' + pad(+m[1]) + '-' + pad(+m[2]) : ''; }
function daysBetween(a, b){ return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
function nice(d){ d = day(d); if (!d) return ''; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.slice(0, 4) === today().slice(0, 4) ? undefined : 'numeric' }); } catch (e) { return d; } }
function crm(){ return W._crm || {}; }
function projects(){ return arr(crm().projects); }
function proj(pid){ try { if (W._gcAut && W._gcAut.proj) { var q = W._gcAut.proj(pid); if (q) return q; } } catch (e) {} return projects().filter(function(p){ return p && String(p.id) === String(pid); })[0] || null; }
function invoices(){ var c = crm(); var a = arr(c.invoices); return a.length ? a : arr(c.invs); }
function subsAll(){ var c = crm(), seen = {}, out = []; arr(c.subs).concat(arr(c.vendors)).forEach(function(v){ var k = s(v && v.id) || low(v && v.name); if (!v || !k || seen[k]) return; seen[k] = 1; out.push(v); }); return out; }
function aqAll(){ try { var c = W._gcCustApprovals ? W._gcCustApprovals() : null; return c ? arr(c.all) : []; } catch (e) { return []; } }
function aqStamp(){ try { var c = W._gcCustApprovals ? W._gcCustApprovals() : null; return c ? (c.loadedAt || 0) + ':' + arr(c.all).length : ''; } catch (e) { return ''; } }
function open(x){ return !!x && (x.status === 'waiting' || x.status === 'sending'); }
function authEmail(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function isOffice(){
  var e = authEmail(); if (!e) return false; if (e === 'office@grayco-cs.com') return true;
  try { var se = W.__GC_AUTH__.session && W.__GC_AUTH__.session(); if (se && low(se.role) === 'office') return true; } catch (x) {}
  return arr(crm().users).some(function(u){ return u && low(u.email) === e && /office/i.test(s(u.role)); });
}
function canEdit(){ return isAdmin() || isOffice(); }
function myName(){ var e = authEmail(); var u = arr(crm().users).filter(function(x){ return x && low(x.email) === e && s(x.name); })[0]; return s(u && u.name) || (e ? e.split('@')[0] : 'Office'); }
function toast(msg, bad){
  var t = D.createElement('div'); t.className = 'gcoff-toast' + (bad ? ' bad' : ''); t.setAttribute('data-gc-keep', '1'); t.setAttribute('role', 'status'); t.textContent = msg;
  Array.prototype.forEach.call(D.querySelectorAll('.gcoff-toast'), function(x){ x.remove(); });
  t.addEventListener('animationend', function(){ t.remove(); }); t.addEventListener('click', function(){ t.remove(); });
  D.body.appendChild(t);
}
function post(url, body){
  return W.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e) { j = { ok: false, error: t ? t.slice(0, 160) : 'No answer (' + r.status + ')' }; } j.__status = r.status; return j; }); },
      function(e){ return { ok: false, error: 'No internet (' + (e && e.message || e) + ')', __status: 0 }; });
}
function api(body){ return post(FN, body); }
function refreshApprovals(){ try { if (W._gcApprovalsRefresh) return Promise.resolve(W._gcApprovalsRefresh()); } catch (e) {} return Promise.resolve(); }

/* ── styles (once) ── */
var CSS = '.gcoff-ov{position:fixed;inset:0;z-index:100215;background:rgba(6,12,20,.72);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:Inter,-apple-system,Arial,sans-serif}' +
  '.gcoff-box{background:#f8fafc;color:#0f172a;border-radius:14px;max-width:980px;width:100%;padding:16px 18px;max-height:none;box-shadow:0 10px 40px rgba(0,0,0,.35)}' +
  '.gcoff-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}.gcoff-h b{font-size:18px}' +
  '.gcoff-x{padding:7px 14px;border:none;border-radius:8px;background:#334155;color:#fff;font-weight:700;cursor:pointer;min-height:36px}' +
  '.gcoff-sub{font-size:12.5px;color:#475569;margin:2px 0 10px;line-height:1.45}' +
  '.gcoff-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:8px 0 12px}' +
  '.gcoff-tile{background:#fff;border:1px solid #e2e8f0;border-top:4px solid #94a3b8;border-radius:10px;padding:9px 11px;text-align:left;cursor:pointer;font:inherit;color:inherit}' +
  '.gcoff-tile.on{outline:2px solid #0f2440}.gcoff-tile .v{font-size:17px;font-weight:800}.gcoff-tile .l{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.3px}.gcoff-tile .n{font-size:11px;color:#94a3b8}' +
  '.gcoff-t{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;font-size:13px}.gcoff-t th{background:#0f2440;color:#fff;text-align:left;padding:7px 8px;font-size:11.5px;font-weight:700}' +
  '.gcoff-t td{padding:7px 8px;border-bottom:1px solid #eef2f7;vertical-align:top}.gcoff-t td.n,.gcoff-t th.n{text-align:right;white-space:nowrap}.gcoff-t tr.tot td{font-weight:800;background:#f1f5f9}' +
  '.gcoff-mut{color:#64748b;font-size:11.5px}.gcoff-chip{display:inline-block;border-radius:9px;padding:1px 7px;font-size:11px;font-weight:700;white-space:nowrap;background:#e2e8f0;color:#334155}' +
  '.gcoff-chip.red{background:#fee2e2;color:#991b1b}.gcoff-chip.amb{background:#fef3c7;color:#92400e}.gcoff-chip.grn{background:#dcfce7;color:#166534}.gcoff-chip.blu{background:#dbeafe;color:#1e40af}' +
  '.gcoff-btn{padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;font-weight:700;font-size:12px;cursor:pointer;min-height:32px}' +
  '.gcoff-btn.p{background:#2563eb;border-color:#2563eb;color:#fff}.gcoff-btn[disabled]{opacity:.55;cursor:default}' +
  '.gcoff-seg{display:inline-flex;gap:4px;margin:0 0 8px}.gcoff-seg button{padding:5px 10px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer}.gcoff-seg button.on{background:#0f2440;color:#fff;border-color:#0f2440}' +
  '.gcoff-empty{padding:18px;text-align:center;color:#475569;background:#fff;border:1px dashed #cbd5e1;border-radius:10px;font-size:13px;line-height:1.5}' +
  '.gcoff-sec{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin:10px 0}.gcoff-sec h3{margin:0 0 6px;font-size:15px}' +
  '.gcoff-warn{background:#fffbeb;border:1px solid #fde68a;color:#78350f;border-radius:10px;padding:8px 11px;font-size:12.5px;line-height:1.45;margin:6px 0}' +
  '.gcoff-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:8px 0}.gcoff-grid label{font-size:12px;font-weight:700;color:#334155;display:flex;flex-direction:column;gap:3px}' +
  '.gcoff-grid input,.gcoff-grid select,.gcoff-ta{font:inherit;font-size:13px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a}' +
  '.gcoff-ta{width:100%;min-height:150px;box-sizing:border-box;font-family:inherit}' +
  '.gcoff-sw{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;cursor:pointer}.gcoff-sw input{width:22px;height:22px;accent-color:#16a34a}' +
  '.gcoff-card-c{border-left:4px solid #2563eb!important}' +
  '.gcoff-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483600;background:#0f766e;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px Arial;max-width:92vw;box-shadow:0 6px 20px rgba(0,0,0,.25);animation:gcoffT 5s forwards}' +
  '.gcoff-toast.bad{background:#b91c1c}@keyframes gcoffT{0%{opacity:0}6%{opacity:1}88%{opacity:1}100%{opacity:0}}' +
  '@media (max-width:640px){.gcoff-t .m{display:none}.gcoff-box{padding:12px}}';
function css(){ if (D.getElementById('gcoff-css')) return; var st = D.createElement('style'); st.id = 'gcoff-css'; st.textContent = CSS; D.head.appendChild(st); }
function overlay(id, title, html){
  css(); var old = D.getElementById(id); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = id; ov.className = 'gcoff-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div class="gcoff-box" role="dialog" aria-label="' + esc(title) + '"><div class="gcoff-h"><b>' + esc(title) + '</b><button type="button" class="gcoff-x" data-offx>Close</button></div><div data-body>' + html + '</div></div>';
  ov.addEventListener('click', function(e){ if (e.target === ov || (e.target.closest && e.target.closest('[data-offx]'))) ov.remove(); });
  D.body.appendChild(ov); return ov;
}

/* ═══════════════ (2) COLLECTIONS ═══════════════ */
var BUCKETS = [['cur', 'Current', 'not due yet', '#16a34a'], ['d30', '1–30 days', 'past due', '#d97706'], ['d60', '31–60 days', 'past due', '#ea580c'], ['d90', '61–90 days', 'past due', '#dc2626'], ['d90p', '90+ days', 'past due', '#7f1d1d']];
function bucketOf(late){ return late <= 0 ? 'cur' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'd90p'; }
/* Accounting's rows (patch K computeAR): the same counted invoices (RULES.revenueRows), balance = billed − collected
   (RULES.collected), due date else invoice date; an overpaid invoice stays as a credit. */
function acctRows(){
  var R = W._gcAcctRules, t = today(), P = {}, out = [];
  projects().forEach(function(p){ if (p && p.id) P[p.id] = p; });
  var list;
  if (R && typeof R.revenueRows === 'function') list = R.revenueRows();
  else list = invoices().filter(function(iv){ var st = low(iv && iv.status); return iv && iv.type === 'client' && !/^(draft|void|denied|cancell?ed)$/.test(st) && n2(iv.amt != null ? iv.amt : iv.amount); });
  list.forEach(function(iv){
    var billed = n2(iv.amt != null ? iv.amt : iv.amount);
    var got = R && R.collected ? R.collected(iv) : (low(iv.status) === 'paid' ? billed : 0);
    var bal = r2(billed - got); if (!(Math.abs(bal) > 0.004)) return;
    var p = P[iv.pid], due = day(iv.dueDate || iv.due) || day(iv.recvDate || iv.date) || t, late = daysBetween(due, t);
    out.push({ id: s(iv.id), inv: iv, pid: s(iv.pid), job: p ? s(p.name) : s(iv.project) || '(no job)', po: s(p && p.autoPO) || s(iv.po),
      customer: s(iv.client || iv.customer) || s(p && p.client) || '(no customer)', num: s(iv.invNum) || s(iv.po) || s(iv.id).slice(-6),
      due: due, late: late, billed: billed, collected: r2(got), balance: bal, bucket: bucketOf(late) });
  });
  return out;
}
var CM = { sig: '', m: null };
function collSig(){ var iv = invoices(); return [iv.length, iv[0] && iv[0].id, iv.length && iv[iv.length - 1] && (iv[iv.length - 1].updatedAt || iv[iv.length - 1].id), invoices() === CM.ref ? 1 : 0, aqStamp(), Object.keys(PENDING).length, today()].join('|'); }
var PENDING = {};
function remState(row){
  var mine = aqAll().filter(function(x){ return x && x.kind === 'payment_reminder' && s((x.meta || {}).invoiceId) === row.id; });
  var w = mine.filter(open)[0];
  var sent = mine.filter(function(x){ return x.status === 'sent'; }).map(function(x){ return s(x.sentAt || x.updatedAt); });
  var iv = row.inv || {}; var log = arr(iv.remindLog).map(function(x){ return s(x && x.at); });
  if (s(iv.lastReminded)) log.push(s(iv.lastReminded));
  var last = sent.concat(log).filter(Boolean).sort().pop() || '';
  return { waiting: !!w || !!PENDING[row.id], waitingSince: w ? s(w.createdAt) : (PENDING[row.id] || ''), last: last };
}
function collections(){
  var sig = collSig(); if (CM.m && CM.sig === sig) return CM.m;
  var rows = acctRows(), tot = { all: 0, past: 0, n: rows.length, npast: 0 };
  BUCKETS.forEach(function(b){ tot[b[0]] = 0; tot[b[0] + 'n'] = 0; });
  var cust = {}, jobs = {};
  rows.forEach(function(r){
    r.rem = remState(r);
    tot[r.bucket] += r.balance; tot[r.bucket + 'n']++; tot.all += r.balance; if (r.late > 0) { tot.past += r.balance; tot.npast++; }
    var c = cust[r.customer] || (cust[r.customer] = { name: r.customer, all: 0, n: 0 }); c.all += r.balance; c.n++; c[r.bucket] = (c[r.bucket] || 0) + r.balance;
    var j = jobs[r.pid || r.job] || (jobs[r.pid || r.job] = { name: r.job, pid: r.pid, customer: r.customer, all: 0, n: 0 }); j.all += r.balance; j.n++; j[r.bucket] = (j[r.bucket] || 0) + r.balance;
  });
  Object.keys(tot).forEach(function(k){ tot[k] = r2(tot[k]); });
  function list(o){ return Object.keys(o).map(function(k){ return o[k]; }).sort(function(a, b){ return b.all - a.all; }); }
  CM = { sig: sig, ref: invoices(), m: { rows: rows.sort(function(a, b){ return b.late - a.late; }), totals: tot, customers: list(cust), jobs: list(jobs), at: Date.now() } };
  return CM.m;
}
var CV = { bucket: '', by: 'inv' };
function remCell(r){
  if (!(r.balance > 0)) return '<span class="gcoff-mut">credit — nothing to collect</span>';
  var st = r.rem || remState(r);
  var b = st.waiting ? '<span class="gcoff-chip blu">⏳ Reminder waiting for approval</span>'
    : '<button type="button" class="gcoff-btn p" data-offrem="' + esc(r.id) + '" title="Puts a payment reminder on ✅ Approvals. Nothing is sent until it is approved.">Send payment reminder</button>';
  return b + '<div class="gcoff-mut">' + (st.last ? 'Last reminder ' + esc(nice(st.last)) : 'No reminder yet') + '</div>';
}
function collHtml(){
  var m = collections(), T = m.totals;
  var tiles = BUCKETS.map(function(b){ return '<button type="button" class="gcoff-tile' + (CV.bucket === b[0] ? ' on' : '') + '" style="border-top-color:' + b[3] + '" data-offbucket="' + b[0] + '"><div class="l">' + b[1] + '</div><div class="v">' + money(T[b[0]]) + '</div><div class="n">' + T[b[0] + 'n'] + ' invoice' + (T[b[0] + 'n'] === 1 ? '' : 's') + ' · ' + b[2] + '</div></button>'; }).join('') +
    '<button type="button" class="gcoff-tile' + (!CV.bucket ? ' on' : '') + '" style="border-top-color:#0f2440" data-offbucket=""><div class="l">Total owed to us</div><div class="v">' + money(T.all) + '</div><div class="n">' + T.n + ' invoice' + (T.n === 1 ? '' : 's') + ' · ' + money(T.past) + ' past due</div></button>';
  var seg = '<div class="gcoff-seg" role="group" aria-label="Show">' + [['inv', 'Every invoice'], ['cust', 'By customer'], ['job', 'By job']].map(function(x){ return '<button type="button" data-offby="' + x[0] + '" class="' + (CV.by === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';
  var rows = m.rows.filter(function(r){ return !CV.bucket || r.bucket === CV.bucket; }), body;
  if (!m.rows.length) body = '<div class="gcoff-empty">🎉 No unpaid client invoices — nothing to collect.<br>Invoices show here once they are approved and sent; paid ones drop off by themselves.</div>';
  else if (!rows.length) body = '<div class="gcoff-empty">Nothing in this age group. Tap <b>Total owed to us</b> to see every unpaid invoice.</div>';
  else if (CV.by === 'inv') {
    body = '<div style="overflow:auto"><table class="gcoff-t"><thead><tr><th>Customer / job</th><th>Invoice</th><th>Due</th><th class="n m">Billed</th><th class="n m">Collected</th><th class="n">Balance</th><th>Reminder</th></tr></thead><tbody>' +
      rows.map(function(r){ var b = BUCKETS.filter(function(x){ return x[0] === r.bucket; })[0];
        return '<tr data-offrow="' + esc(r.id) + '"><td><b>' + esc(r.customer) + '</b><div class="gcoff-mut">' + esc(r.job) + (r.po ? ' · ' + esc(r.po) : '') + '</div></td><td>#' + esc(r.num) + '</td>' +
          '<td>' + esc(nice(r.due)) + '<div><span class="gcoff-chip" style="background:' + b[3] + ';color:#fff">' + (r.late > 0 ? r.late + ' day' + (r.late === 1 ? '' : 's') + ' late' : 'not due yet') + '</span></div></td>' +
          '<td class="n m">' + money(r.billed) + '</td><td class="n m">' + money(r.collected) + '</td><td class="n"><b>' + money(r.balance) + '</b></td><td>' + remCell(r) + '</td></tr>'; }).join('') +
      '<tr class="tot"><td colspan="5">Total' + (CV.bucket ? ' · ' + esc(BUCKETS.filter(function(x){ return x[0] === CV.bucket; })[0][1]) : '') + '</td><td class="n">' + money(rows.reduce(function(a, r){ return a + r.balance; }, 0)) + '</td><td></td></tr></tbody></table></div>';
  } else {
    var grp = {}; rows.forEach(function(r){ var k = CV.by === 'cust' ? r.customer : (r.pid || r.job); var g = grp[k] || (grp[k] = { name: CV.by === 'cust' ? r.customer : r.job, sub: CV.by === 'cust' ? '' : r.customer, pid: r.pid, all: 0, n: 0 }); g.all += r.balance; g.n++; BUCKETS.forEach(function(b){ g[b[0]] = (g[b[0]] || 0) + (r.bucket === b[0] ? r.balance : 0); }); });
    var gl = Object.keys(grp).map(function(k){ return grp[k]; }).sort(function(a, b){ return b.all - a.all; });
    body = '<div style="overflow:auto"><table class="gcoff-t"><thead><tr><th>' + (CV.by === 'cust' ? 'Customer' : 'Job') + '</th>' + BUCKETS.map(function(b){ return '<th class="n m">' + b[1] + '</th>'; }).join('') + '<th class="n">Total</th></tr></thead><tbody>' +
      gl.map(function(g){ return '<tr><td><b>' + esc(g.name) + '</b>' + (g.sub ? '<div class="gcoff-mut">' + esc(g.sub) + '</div>' : '') + '<div class="gcoff-mut">' + g.n + ' invoice' + (g.n === 1 ? '' : 's') + '</div></td>' + BUCKETS.map(function(b){ return '<td class="n m">' + (g[b[0]] ? money(g[b[0]]) : '—') + '</td>'; }).join('') + '<td class="n"><b>' + money(g.all) + '</b></td></tr>'; }).join('') +
      '<tr class="tot"><td>Total</td>' + BUCKETS.map(function(b){ return '<td class="n m">' + money(gl.reduce(function(a, g){ return a + (g[b[0]] || 0); }, 0)) + '</td>'; }).join('') + '<td class="n">' + money(gl.reduce(function(a, g){ return a + g.all; }, 0)) + '</td></tr></tbody></table></div>';
  }
  return '<div class="gcoff-coll" data-offcoll-root>' +
    '<div class="gcoff-sub">Unpaid client invoices by how late they are — the same invoices and balances as Accounting → ⬇ Money In (balance = billed − collected; due date, or the invoice date when there is none). <b>Send payment reminder</b> puts one reminder on ✅ Approvals; nothing goes to the customer until it is approved, and there is never more than one waiting per invoice.</div>' +
    '<div class="gcoff-tiles">' + tiles + '</div>' + seg + body + '</div>';
}
function paintColl(){ Array.prototype.forEach.call(D.querySelectorAll('[data-offcoll-root]'), function(el){ var w = D.createElement('div'); w.innerHTML = collHtml(); el.replaceWith(w.firstChild); }); }
function openCollections(){ CM.sig = ''; overlay('gcoff-coll-ov', '📬 Collections', collHtml()); }
function sendReminder(id, btn){
  if (btn) { btn.disabled = true; btn.textContent = 'Putting it on Approvals…'; }
  return api({ action: 'remind', invoiceId: id }).then(function(j){
    if (j && j.ok && (j.queued || j.already)) {
      PENDING[id] = new Date().toISOString(); CM.sig = '';
      toast(j.already ? 'A reminder for this invoice is already waiting on ✅ Approvals.' : 'Payment reminder is on ✅ Approvals — it goes out once approved.');
      return refreshApprovals().then(function(){ CM.sig = ''; paintColl(); repaintAcct(); });
    }
    toast((j && j.error) || 'The reminder was not put on Approvals — try again.', true);
    if (btn) { btn.disabled = false; btn.textContent = 'Send payment reminder'; }
  });
}
function repaintAcct(){ try { if (D.querySelector('#gck-body') && W._gcAcctRender) W._gcAcctRender(true); } catch (e) {} }
/* Accounting → Home: a card; → Money In: a strip on top and the reminder column */
function acctCard(){
  var T = collections().totals;
  return '<button type="button" class="gck-card gcoff-card-c" data-offcoll="1"><h3>📬 Collections</h3><div class="gck-big">' + money(T.past) + '</div><div class="gck-sub">past due on ' + T.npast + ' invoice' + (T.npast === 1 ? '' : 's') + ' · ' + money(T.d90p) + ' over 90 days · send payment reminders (through ✅ Approvals)</div></button>';
}
function inStrip(){
  var T = collections().totals;
  return '<div class="gck-note" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 0">' + BUCKETS.map(function(b){ return '<span class="gcoff-chip" style="background:' + b[3] + ';color:#fff">' + b[1] + ': ' + money0(T[b[0]]) + '</span>'; }).join('') +
    '<button type="button" class="gck-btn s" data-offcoll="1">📬 Open the Collections board</button></div>';
}
function remindCell(r){ var row = collections().rows.filter(function(x){ return x.id === s(r && r.id); })[0]; return row ? remCell(row) : ''; }
/* the 🏢 Office page's "What needs you today" */
function todayTile(){
  var T = collections().totals, n = T.npast;
  var badge = n > 0 ? '<span style="background:#ef4444;color:#14202e;font-size:14px;font-weight:800;border-radius:12px;padding:2px 10px;margin-left:auto;">' + n + '</span>' : '<span style="color:#23693d;font-size:13px;font-weight:700;margin-left:auto;">✓</span>';
  return '<button type="button" data-offcoll="1" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:12px;padding:16px 18px;margin-bottom:10px;cursor:pointer;">' +
    '<span style="font-size:24px;">📬</span><span style="color:#14202e;font-size:15px;font-weight:700;">Collections: ' + money0(T.past) + ' past due' + (T.d90p > 0 ? ' · ' + money0(T.d90p) + ' over 90 days' : '') + '<span style="display:block;font-size:12px;font-weight:400;color:#64748b">Send payment reminders — each waits on ✅ Approvals</span></span>' + badge + '</button>';
}

/* ═══════════════ (3) SUB PAPERWORK ═══════════════ */
function coiExp(v){ return day(v && (v.coiExp || v.insExp || v.insuranceExp || v.coiExpiration)); }
function hasW9(v){ if (!v) return false; if (s(v.tin || v.taxId || v.ein)) return true; var w = v.w9; if (w === true) return true; var t = low(w); return !!t && w !== false && !/^(no|false|expired|missing|0|none)$/.test(t); }
function expChip(d){
  d = day(d); if (!d) return '';
  var n = daysBetween(today(), d);
  if (n < 0) return 'expired ' + (-n) + ' day' + (n === -1 ? '' : 's') + ' ago';
  if (n === 0) return 'expires today';
  return 'expires in ' + n + ' day' + (n === 1 ? '' : 's');
}
function expChipHtml(d){ var t = expChip(d); if (!t) return ''; var n = daysBetween(today(), day(d)); return '<span class="gcoff-chip ' + (n < 0 ? 'red' : n <= 30 ? 'amb' : 'grn') + '">' + esc(t) + '</span>'; }
/* the CRM's own pay rule (the Subs tab's "Can Pay?" and its PAYMENT BLOCK note): GL current, WC current or exempt, W-9 */
function payBlock(v){
  if (!v) return [];
  var t = today(), why = [], gl = day(v.insExp || v.insuranceExp || v.coiExp || v.coiExpiration), wc = day(v.wcExp);
  if (!gl) why.push('no insurance date'); else if (gl <= t) why.push('insurance expired');
  if (!v.wcExempt) { if (!wc) why.push('no workers’ comp'); else if (wc <= t) why.push('workers’ comp expired'); }
  if (!v.w9) why.push('no W-9');
  return why;
}
function blockWhy(v){ var w = payBlock(v); return w.length ? 'Payment blocked: ' + w.join(', ') : ''; }
function payBlockHtml(v){ var w = payBlock(v); return w.length ? '<div style="margin-top:3px"><span class="gcoff-chip red" title="Do not pay this sub until these are on file">⛔ Payment blocked: ' + esc(w.join(', ')) + '</span></div>' : ''; }
var SUBREQ = {};
function subReq(v){
  var id = s(v && v.id), mine = aqAll().filter(function(x){ return x && x.kind === 'sub_doc_request' && s((x.meta || {}).subId) === id; });
  var w = mine.filter(open)[0], sent = mine.filter(function(x){ return x.status === 'sent'; }).map(function(x){ return s(x.sentAt || x.updatedAt); }).sort().pop();
  return { waiting: !!w || !!SUBREQ[id], last: sent || '' };
}
function subReqState(v){ css(); var st = subReq(v); return st.waiting ? '<div style="margin-top:3px"><span class="gcoff-chip blu">⏳ Request waiting for approval</span></div>' : st.last ? '<div class="gcoff-mut" style="margin-top:3px">Requested ' + esc(nice(st.last)) + '</div>' : ''; }
function subDoc(v, missing, btn){
  if (!v) return;
  var need = []; arr(missing).forEach(function(m){ if (/COI|insurance/i.test(m) && need.indexOf('coi') < 0) need.push('coi'); if (/W-9/i.test(m) && need.indexOf('w9') < 0) need.push('w9'); if (/workers/i.test(m) && need.indexOf('wc') < 0) need.push('wc'); });
  if (btn) { btn.disabled = true; btn.textContent = 'Putting it on Approvals…'; }
  return api({ action: 'subdoc', subId: s(v.id), name: s(v.name), need: need }).then(function(j){
    if (j && j.ok) { SUBREQ[s(v.id)] = 1; toast(j.already ? 'A request to ' + (v.name || 'this sub') + ' is already waiting on ✅ Approvals.' : 'Request to ' + (v.name || 'the sub') + ' is on ✅ Approvals — it goes out once approved.'); if (btn) { btn.textContent = '⏳ Waiting for approval'; } refreshApprovals(); return j; }
    toast((j && j.error) || 'Not put on Approvals — try again.', true); if (btn) { btn.disabled = false; btn.textContent = 'Request docs'; } return j;
  });
}

/* ═══════════════ (4) LIENS & WAIVERS (job page) ═══════════════ */
function LR(){ return W._gcLienRules; }
function lt(p){ return (p && p.lienTrack && typeof p.lienTrack === 'object') ? p.lienTrack : {}; }
function saveLien(pid, patch, msg){
  if (!canEdit()) { toast('Only the office or an admin can change this.', true); return Promise.resolve(false); }
  if (!W._gcAut || !W._gcAut.saveProject) { toast('Could not save — reload the CRM and try again.', true); return Promise.resolve(false); }
  var me = myName(), at = new Date().toISOString();
  return Promise.resolve(W._gcAut.saveProject(pid, function(q){
    var cur = (q.lienTrack && typeof q.lienTrack === 'object') ? q.lienTrack : {};
    var nx = Object.assign({}, cur, typeof patch === 'function' ? patch(cur) : patch, { by: me, at: at });
    q.lienTrack = nx;
  })).then(function(){ if (msg) toast(msg); return true; }, function(){ toast('Not saved — try again.', true); return false; });
}
var STCHIP = { done: ['grn', '✓ Done'], passed: ['red', 'Last day passed'], now: ['red', 'Do it now'], soon: ['amb', 'Coming up'], later: ['', 'Later'], 'needs-date': ['', 'Needs a date'] };
var NEEDL = { start: 'the start date', last: 'the last day of work', filed: 'the date the lien was filed' };
function deadlinesHtml(p){
  var L = lt(p), on = L.on === true, edit = canEdit();
  var h = '<div class="gcoff-sec"><h3>Lien deadlines</h3>' +
    '<label class="gcoff-sw"><input type="checkbox" data-offlien="on"' + (on ? ' checked' : '') + (edit ? '' : ' disabled') + '> Track lien deadlines for this job</label>';
  if (!on) return h + '<div class="gcoff-sub" style="margin-top:6px">Off (the default). Turn it on for a job where GrayCo may need its lien rights — the office then sees the Tennessee, Arkansas or Mississippi notice deadlines here and gets a To-Do before each one.' + (edit ? '' : ' Only the office or an admin can turn it on.') + '</div></div>';
  var R = LR(); if (!R) return h + '<div class="gcoff-warn">The lien rules did not load — reload the CRM.</div></div>';
  var c = R.compute(p, today());
  function sel(name, opts, val){ return '<select data-offlf="' + name + '"' + (edit ? '' : ' disabled') + '>' + opts.map(function(o){ return '<option value="' + o[0] + '"' + (String(val) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  h += '<div class="gcoff-warn">⚖️ ' + esc(c.disclaimer) + ' The rules and their sources are in docs/LIEN-DEADLINES.md for the lawyer.</div>' +
    '<div class="gcoff-grid">' +
    '<label>State' + sel('state', [['', 'From the job' + (c.state && !s(L.state) ? ' (' + c.state + ')' : '')], ['TN', 'Tennessee'], ['AR', 'Arkansas'], ['MS', 'Mississippi']], s(L.state)) + '</label>' +
    '<label>GrayCo is' + sel('role', [['', 'From the job (' + (c.role === 'sub' ? 'sub' : 'prime') + ')'], ['prime', 'Prime contractor (contract with the owner)'], ['sub', 'Sub under a GC']], s(L.role)) + '</label>' +
    '<label>Kind of job' + sel('residential', [['', 'From the job (' + (c.residential ? 'residential' : 'commercial') + ')'], ['true', 'Residential'], ['false', 'Commercial / non-residential']], L.residential === true ? 'true' : L.residential === false ? 'false' : '') + '</label>' +
    '<label>Start date<input type="date" data-offlf="start" value="' + esc(s(L.start) || c.start) + '"' + (edit ? '' : ' disabled') + '></label>' +
    '<label>Last day of work<input type="date" data-offlf="lastWork" value="' + esc(s(L.lastWork)) + '"' + (edit ? '' : ' disabled') + '><span class="gcoff-mut" style="font-weight:400">' + (s(L.lastWork) ? 'entered' : c.last ? 'using ' + esc(nice(c.last)) + ' — ' + esc(c.lastHow) : 'enter it when the work ends') + '</span></label>' +
    '<label>Lien filed on (if filed)<input type="date" data-offlf="filedAt" value="' + esc(s(L.filedAt)) + '"' + (edit ? '' : ' disabled') + '></label>' +
    '</div>' + (edit ? '<button type="button" class="gcoff-btn p" data-offlien="save">Save</button>' : '');
  if (!c.items.length) h += '<div class="gcoff-empty" style="margin-top:8px">' + esc(c.notes[0] || 'No deadlines for this job.') + '</div>';
  else h += '<div style="overflow:auto;margin-top:10px"><table class="gcoff-t"><thead><tr><th>Step</th><th>Last day</th><th>Aim to finish by</th><th>Status</th><th></th></tr></thead><tbody>' +
    c.items.map(function(x){ var st = STCHIP[x.status] || ['', x.status];
      return '<tr><td><b>' + esc(x.title) + '</b><div class="gcoff-mut">' + esc(x.cite) + ' · confirm with your lawyer</div><div class="gcoff-mut">' + esc(x.note) + '</div></td>' +
        '<td>' + (x.due ? esc(nice(x.due)) : '<span class="gcoff-mut">needs ' + esc(NEEDL[x.need] || 'a date') + '</span>') + '</td><td>' + (x.aim ? esc(nice(x.aim)) : '—') + '</td>' +
        '<td><span class="gcoff-chip ' + st[0] + '">' + st[1] + '</span></td><td>' + (edit && x.due ? '<button type="button" class="gcoff-btn" data-offdone="' + esc(x.key) + '">' + (x.status === 'done' ? 'Undo' : 'Mark done') + '</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  if (c.notes.length && c.items.length) h += c.notes.map(function(n){ return '<div class="gcoff-warn">⚖️ ' + esc(n) + '</div>'; }).join('');
  return h + '<div class="gcoff-mut" style="margin-top:6px">The office To-Do gets a reminder about three weeks before each “aim” date. Rules version ' + esc(c.version) + '.</div></div>';
}
var LW = {};   /* per job: the sub waivers list (lien function), read when the panel opens */
function custInvs(pid){ return invoices().filter(function(iv){ return iv && String(iv.pid) === String(pid) && (iv.type === 'client' || iv.type === 'customer') && !/^(draft|void|deleted|denied|cancell?ed|pm_review)$/.test(low(iv.status)); }); }
function subInvs(pid){ return invoices().filter(function(iv){ return iv && String(iv.pid) === String(pid) && /sub/.test(low(iv.type)) && !/^(void|deleted|denied|declined)$/.test(low(iv.status)) && iv._pmDenied !== true; }); }
function paidOf(iv){ var R = W._gcAcctRules; var a = n2(iv.amt != null ? iv.amt : iv.amount); return R && R.collected ? R.collected(iv) : (low(iv.status) === 'paid' ? a : 0); }
var LWPEND = {};
function waiversHtml(p){
  var pid = String(p.id), edit = canEdit(), L = lt(p), subW = L.subW || {};
  var ci = custInvs(pid), si = subInvs(pid), aq = aqAll();
  var h = '<div class="gcoff-sec"><h3>Lien waivers, per payment</h3><div class="gcoff-sub">Each waiver e-mail waits on ✅ Approvals; nothing goes out by itself.' + (edit ? ' <button type="button" class="gcoff-btn" data-offword="1">✏️ Waiver wording</button>' : '') + '</div>';
  h += '<b style="font-size:13px">From GrayCo to the customer</b>';
  if (!ci.length) h += '<div class="gcoff-empty">No customer invoices on this job yet. When the customer pays, prepare GrayCo’s waiver for that payment here.</div>';
  else h += '<div style="overflow:auto"><table class="gcoff-t"><thead><tr><th>Invoice</th><th class="n">Amount</th><th class="n">Paid</th><th>Waiver</th><th></th></tr></thead><tbody>' + ci.map(function(iv){
    var mine = aq.filter(function(x){ return x && x.kind === 'lien_waiver' && s((x.meta || {}).invoiceId) === s(iv.id); });
    var st = mine.map(function(x){ var k = s((x.meta || {}).waiver) || 'conditional'; return '<span class="gcoff-chip ' + (x.status === 'sent' ? 'grn' : open(x) ? 'blu' : '') + '">' + (k === 'unconditional' ? 'Unconditional' : 'Conditional') + ': ' + (x.status === 'sent' ? 'sent ' + esc(nice(x.sentAt || x.updatedAt)) : open(x) ? 'waiting for approval' : esc(x.status)) + '</span>'; }).join(' ');
    if (LWPEND[s(iv.id)]) st += ' <span class="gcoff-chip blu">waiting for approval</span>';
    var paid = paidOf(iv);
    return '<tr><td>#' + esc(s(iv.invNum) || s(iv.po) || s(iv.id).slice(-6)) + '<div class="gcoff-mut">' + esc(nice(iv.date)) + '</div></td><td class="n">' + money(n2(iv.amt != null ? iv.amt : iv.amount)) + '</td><td class="n">' + money(paid) + '</td><td>' + (st || '<span class="gcoff-mut">none yet</span>') + '</td>' +
      '<td style="white-space:nowrap">' + (edit ? '<button type="button" class="gcoff-btn" data-offcw="conditional" data-inv="' + esc(iv.id) + '">Conditional</button> <button type="button" class="gcoff-btn" data-offcw="unconditional" data-inv="' + esc(iv.id) + '"' + (paid > 0 ? '' : ' disabled title="Record the payment first"') + '>Unconditional</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  h += '<b style="font-size:13px;display:block;margin-top:10px">From subs (what they give GrayCo)</b>';
  var wl = LW[pid] && LW[pid].list;
  if (!si.length) h += '<div class="gcoff-empty">No sub invoices on this job yet. Each sub payment shows here with its waiver: requested, waiting, received (conditional or unconditional).</div>';
  else h += (LW[pid] && LW[pid].error ? '<div class="gcoff-warn">' + esc(LW[pid].error) + '</div>' : '') + '<div style="overflow:auto"><table class="gcoff-t"><thead><tr><th>Sub / invoice</th><th class="n">Amount</th><th>Waiver</th><th></th></tr></thead><tbody>' + si.map(function(iv){
    var w = arr(wl).filter(function(x){ return x && s(x.id) === 'LWc_' + s(iv.id); })[0], man = subW[s(iv.id)];
    var st;
    if (man) st = '<span class="gcoff-chip grn">✓ Received ' + (man.kind === 'unconditional' ? 'unconditional' : 'conditional') + ' ' + esc(nice(man.at)) + '</span><div class="gcoff-mut">marked by ' + esc(man.by || '') + '</div>';
    else if (w && /^(signed|uploaded)$/.test(s(w.status))) st = '<span class="gcoff-chip grn">✓ Received (conditional) ' + esc(nice(w.signedAt || w.uploadedAt)) + '</span>';
    else if (w && w.status === 'sent') st = '<span class="gcoff-chip amb">Requested ' + esc(nice(w.sentAt)) + ' — not signed yet</span>';
    else if (w && (w.status === 'waiting_approval' || w.status === 'new')) st = '<span class="gcoff-chip blu">Request waiting for approval</span>';
    else if (w && w.status === 'no_email') st = '<span class="gcoff-chip red">No e-mail on file for this sub</span>';
    else st = wl ? '<span class="gcoff-mut">not requested</span>' : '<span class="gcoff-mut">…</span>';
    if (LWPEND[s(iv.id)] && !man && !(w && /^(signed|uploaded|sent)$/.test(s(w.status)))) st = '<span class="gcoff-chip blu">Request waiting for approval</span>';
    var got = !!man || (w && /^(signed|uploaded)$/.test(s(w.status)));
    return '<tr><td><b>' + esc(s(iv.sub || iv.vendor) || 'Sub') + '</b><div class="gcoff-mut">#' + esc(s(iv.invNum) || s(iv.id).slice(-6)) + ' · ' + esc(s(iv.status)) + '</div></td><td class="n">' + money(n2(iv.amt != null ? iv.amt : iv.amount)) + '</td><td>' + st + '</td>' +
      '<td style="white-space:nowrap">' + (edit ? (got ? (man ? '<button type="button" class="gcoff-btn" data-offsw="clear" data-inv="' + esc(iv.id) + '">Undo</button>' : '') :
        '<button type="button" class="gcoff-btn" data-offsw="request" data-inv="' + esc(iv.id) + '">Request waiver</button> <select data-offswk="' + esc(iv.id) + '" aria-label="Kind received"><option value="conditional">Conditional</option><option value="unconditional">Unconditional</option></select> <button type="button" class="gcoff-btn" data-offsw="got" data-inv="' + esc(iv.id) + '">Mark received</button>') : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  return h + '</div>';
}
function liensHtml(p){ return deadlinesHtml(p) + waiversHtml(p); }
var CUR = { pid: '', kind: '' };
function liens(pid){
  var p = proj(pid); if (!p) { toast('Open the job first.', true); return; }
  CUR = { pid: String(pid), kind: 'liens' };
  var ov = overlay('gcoff-job-ov', '⚖️ Liens & waivers — ' + (s(p.name) || 'job'), liensHtml(p));
  ov.setAttribute('data-pid', String(pid));
  if (subInvs(pid).length) post(LIENFN, { action: 'list' }).then(function(j){
    LW[String(pid)] = j && j.ok ? { list: arr(j.waivers), at: Date.now() } : { list: [], error: (j && j.error) || 'Could not read the sub waivers.' };
    repaintJob();
  });
  return ov;
}
function repaintJob(){
  var ov = D.getElementById('gcoff-job-ov'); if (!ov) return;
  var p = proj(ov.getAttribute('data-pid')); if (!p) return;
  var b = ov.querySelector('[data-body]'); if (!b) return;
  b.innerHTML = CUR.kind === 'cos' ? cosHtml(p) : liensHtml(p);
}
function readLienForm(ov){
  var o = {}; Array.prototype.forEach.call(ov.querySelectorAll('[data-offlf]'), function(el){ o[el.getAttribute('data-offlf')] = el.value; });
  return { state: s(o.state), role: s(o.role), residential: o.residential === 'true' ? true : o.residential === 'false' ? false : null, start: day(o.start), lastWork: day(o.lastWork), filedAt: day(o.filedAt) };
}
function wordingEditor(){
  if (!canEdit()) return;
  var ov = overlay('gcoff-word-ov', '✏️ Lien waiver wording', '<div class="gcoff-empty">Loading…</div>');
  api({ action: 'wording' }).then(function(j){
    var b = ov.querySelector('[data-body]'); if (!b) return;
    if (!j || !j.ok) { b.innerHTML = '<div class="gcoff-warn">' + esc((j && j.error) || 'Could not load the wording.') + '</div>'; return; }
    var LAB = { sub_conditional: 'From a sub — conditional, progress payment', sub_final: 'From a sub — conditional, final payment', cust_conditional: 'From GrayCo to the customer — conditional', cust_unconditional: 'From GrayCo to the customer — unconditional' };
    b.innerHTML = '<div class="gcoff-warn">' + esc(j.draftNote) + ' The first paragraph is the title. Blank lines start a new paragraph. These fill in by themselves: ' + j.placeholders.map(function(x){ return '{{' + x + '}}'; }).join(' ') + '. A sub’s waiver keeps the wording of the day it was asked for.</div>' +
      Object.keys(LAB).map(function(k){ return '<div class="gcoff-sec"><h3>' + esc(LAB[k]) + (j.custom[k] ? ' <span class="gcoff-chip blu">edited</span>' : ' <span class="gcoff-chip">built-in draft</span>') + '</h3><textarea class="gcoff-ta" data-offwk="' + k + '">' + esc(j.texts[k]) + '</textarea>' +
        '<button type="button" class="gcoff-btn" data-offwreset="' + k + '">Back to the built-in text</button></div>'; }).join('') +
      '<button type="button" class="gcoff-btn p" data-offwsave="1">Save the wording</button>' + (j.by ? ' <span class="gcoff-mut">Last changed by ' + esc(j.by) + ' ' + esc(nice(j.at)) + '</span>' : '');
  });
}
function saveWording(ov, resetKey){
  var set = {}; Array.prototype.forEach.call(ov.querySelectorAll('[data-offwk]'), function(t){ set[t.getAttribute('data-offwk')] = t.value; });
  if (resetKey) set[resetKey] = '';
  return api({ action: 'wording', set: set }).then(function(j){ if (j && j.ok) { toast('Waiver wording saved.'); ov.remove(); if (resetKey) wordingEditor(); } else toast((j && j.error) || 'Not saved.', true); });
}

/* ═══════════════ (7) UNSIGNED CHANGE ORDERS (job page) ═══════════════ */
var COS = {};
function cosHtml(p){
  var pid = String(p.id), c = COS[pid];
  var h = '<div class="gcoff-sub">Every change order sent for a signature and not signed yet — the customer’s (✍️ Signatures in the customer portal) and the GC’s (GC portal). <b>Nudge</b> puts one friendly reminder on ✅ Approvals; nothing goes out until it is approved, and there is never more than one waiting per change order.</div>';
  if (!c) return h + '<div class="gcoff-empty">Loading the change orders…</div>';
  if (c.error) return h + '<div class="gcoff-warn">' + esc(c.error) + '</div>';
  if (!c.list.length) return h + '<div class="gcoff-empty">✓ No change orders waiting for a signature on this job.<br>A change order sent from the COs tab shows here until it is signed.</div>';
  return h + '<div style="overflow:auto"><table class="gcoff-t"><thead><tr><th>Change order</th><th class="n">Amount</th><th>Sent</th><th>Waiting</th><th>Reminder</th></tr></thead><tbody>' + c.list.map(function(x){
    var wait = x.days == null ? '<span class="gcoff-chip">e-mail waiting on Approvals</span>' : '<span class="gcoff-chip ' + (x.days >= 14 ? 'red' : x.days >= 7 ? 'amb' : '') + '">' + x.days + ' day' + (x.days === 1 ? '' : 's') + '</span>';
    var btn = x.openNudge || x.__pend ? '<span class="gcoff-chip blu">⏳ Reminder waiting for approval</span>' : x.sentAt ? '<button type="button" class="gcoff-btn p" data-offnudge="' + esc(x.ref) + '">Nudge</button>' : '<span class="gcoff-mut">not sent yet</span>';
    return '<tr><td><b>' + esc(x.title) + '</b><div class="gcoff-mut">' + (x.src === 'gc' ? 'to the GC' : 'to the customer') + '</div></td><td class="n">' + (x.amount == null ? '—' : money(x.amount)) + '</td><td>' + (x.sentAt ? esc(nice(x.sentAt)) : '—') + '</td><td>' + wait + '</td>' +
      '<td>' + btn + '<div class="gcoff-mut">' + (x.lastNudge ? 'Last reminder ' + esc(nice(x.lastNudge)) : 'No reminder yet') + '</div></td></tr>'; }).join('') + '</tbody></table></div>';
}
function loadCos(pid, force){
  pid = String(pid); var c = COS[pid];
  if (c && !force && Date.now() - c.at < 60e3) return Promise.resolve(c);
  return api({ action: 'cos', pid: pid }).then(function(j){ COS[pid] = j && j.ok ? { list: arr(j.cos), at: Date.now() } : { list: [], error: (j && j.error) || 'Could not read the change orders.', at: 0 }; return COS[pid]; });
}
function cos(pid){
  var p = proj(pid); if (!p) { toast('Open the job first.', true); return; }
  CUR = { pid: String(pid), kind: 'cos' };
  var ov = overlay('gcoff-job-ov', '✍️ Unsigned change orders — ' + (s(p.name) || 'job'), cosHtml(p));
  ov.setAttribute('data-pid', String(pid));
  loadCos(pid).then(repaintJob);
  return ov;
}
function nudge(ref, btn){
  if (btn) { btn.disabled = true; btn.textContent = 'Putting it on Approvals…'; }
  return api({ action: 'nudge', ref: ref }).then(function(j){
    if (j && j.ok) { Object.keys(COS).forEach(function(k){ arr(COS[k].list).forEach(function(x){ if (x.ref === ref) x.__pend = true; }); }); toast(j.already ? 'A reminder for this change order is already waiting on ✅ Approvals.' : 'Reminder to sign is on ✅ Approvals — it goes out once approved.'); repaintJob(); refreshApprovals(); return j; }
    toast((j && j.error) || 'Not put on Approvals — try again.', true); if (btn) { btn.disabled = false; btn.textContent = 'Nudge'; } return j;
  });
}

/* ── 🧰 Job tools: two buttons (the bar keeps [data-mkt2] children across its rebuilds — the ESTIN pattern) ── */
function decoBar(b){
  try {
    if (!b || b.hasAttribute('data-field') || b.querySelector('[data-mkt2="offfeat"]')) return;
    var pid = b.getAttribute('data-pid'); if (!pid) return;
    var w = D.createElement('span'); w.setAttribute('data-mkt2', 'offfeat'); w.style.display = 'contents';
    w.innerHTML = '<button type="button" data-offjob="liens" data-pid="' + esc(pid) + '">⚖️ Liens &amp; waivers</button><button type="button" data-offjob="cos" data-pid="' + esc(pid) + '">✍️ Unsigned COs</button>';
    b.appendChild(w);
  } catch (e) {}
}
function wrapDeco(){
  var f = W._gcMkt2Deco; if (typeof f !== 'function' || f.__gcOffFeat) return false;
  var w = function(b){ var r = f.apply(this, arguments); decoBar(b); return r; };
  Object.keys(f).forEach(function(k){ try { w[k] = f[k]; } catch (e) {} });
  w.__gcOffFeat = true; W._gcMkt2Deco = w;
  Array.prototype.forEach.call(D.querySelectorAll('.gc-a8-bar[data-pid]'), decoBar);
  return true;
}

/* ── one click listener (capture: before the CRM's own row / card handlers) ── */
D.addEventListener('click', function(e){
  var t = e.target; if (!t || !t.closest) return;
  var b = t.closest('[data-offrem],[data-offcoll],[data-offbucket],[data-offby],[data-offjob],[data-offnudge],[data-offlien="save"],[data-offdone],[data-offcw],[data-offsw],[data-offword],[data-offwsave],[data-offwreset]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  if (b.disabled) return;
  var v;
  if ((v = b.getAttribute('data-offrem')) != null) return sendReminder(v, b);
  if (b.hasAttribute('data-offcoll')) return openCollections();
  if ((v = b.getAttribute('data-offbucket')) != null) { CV.bucket = CV.bucket === v ? '' : v; return paintColl(); }
  if ((v = b.getAttribute('data-offby')) != null) { CV.by = v; return paintColl(); }
  if ((v = b.getAttribute('data-offjob')) != null) return v === 'cos' ? cos(b.getAttribute('data-pid')) : liens(b.getAttribute('data-pid'));
  if ((v = b.getAttribute('data-offnudge')) != null) return nudge(v, b);
  var ov = b.closest('.gcoff-ov'), pid = ov && ov.getAttribute('data-pid');
  if ((v = b.getAttribute('data-offlien')) != null) {
    if (v === 'save') { var f = readLienForm(ov); return saveLien(pid, f, 'Lien details saved.').then(repaintJob); }
    return;
  }
  if ((v = b.getAttribute('data-offdone')) != null) { var key = v; return saveLien(pid, function(cur){ var d = Object.assign({}, cur.done || {}); if (d[key]) delete d[key]; else d[key] = { at: new Date().toISOString(), by: myName() }; return { done: d }; }, 'Saved.').then(repaintJob); }
  if ((v = b.getAttribute('data-offcw')) != null) {
    var inv = b.getAttribute('data-inv'); b.disabled = true;
    return api({ action: 'lienw', invoiceId: inv, kind: v }).then(function(j){ if (j && j.ok) { LWPEND[inv] = 1; toast(j.already ? 'That waiver is already waiting on ✅ Approvals.' : 'Lien waiver is on ✅ Approvals — it goes out once approved.'); refreshApprovals().then(repaintJob); } else { toast((j && j.error) || 'Not put on Approvals.', true); b.disabled = false; } });
  }
  if ((v = b.getAttribute('data-offsw')) != null) {
    var iv = b.getAttribute('data-inv');
    if (v === 'request') { b.disabled = true; return post(LIENFN, { action: 'request', invId: iv, viaApproval: true }).then(function(j){ if (j && j.ok) { LWPEND[iv] = 1; toast(j.already ? 'A waiver was already requested for this payment.' : 'Waiver request is on ✅ Approvals — it goes out once approved.'); delete LW[String(pid)]; post(LIENFN, { action: 'list' }).then(function(k){ if (k && k.ok) LW[String(pid)] = { list: arr(k.waivers), at: Date.now() }; repaintJob(); }); } else { toast((j && j.error) || 'Not requested.', true); b.disabled = false; } }); }
    if (v === 'got') { var sk = Array.prototype.filter.call(ov.querySelectorAll('[data-offswk]'), function(x){ return x.getAttribute('data-offswk') === iv; })[0]; var kind = sk ? sk.value : 'conditional'; return saveLien(pid, function(cur){ var m = Object.assign({}, cur.subW || {}); m[iv] = { kind: kind, at: today(), by: myName() }; return { subW: m }; }, 'Marked received.').then(repaintJob); }
    if (v === 'clear') return saveLien(pid, function(cur){ var m = Object.assign({}, cur.subW || {}); delete m[iv]; return { subW: m }; }, 'Undone.').then(repaintJob);
  }
  if (b.hasAttribute('data-offword')) return wordingEditor();
  if (b.hasAttribute('data-offwsave')) return saveWording(ov, '');
  if ((v = b.getAttribute('data-offwreset')) != null) return saveWording(ov, v);
}, true);
/* the "Track lien deadlines" switch saves at once */
D.addEventListener('change', function(e){
  var t = e.target; if (!t || !t.getAttribute || t.getAttribute('data-offlien') !== 'on') return;
  var ov = t.closest('.gcoff-ov'), pid = ov && ov.getAttribute('data-pid'); if (!pid) return;
  saveLien(pid, { on: !!t.checked }, t.checked ? 'Lien deadlines are tracked for this job.' : 'Lien deadline tracking is off for this job.').then(repaintJob);
}, true);

/* the old Collections Desk doors (Accounting 💎 menu, the Office To-Do's Collections items) open the board */
if (typeof W._gcOpenCollectionsDesk === 'function' && !W._gcOpenCollectionsDesk.__gcOffFeat) W._gcOpenCollectionsDeskOld = W._gcOpenCollectionsDesk;
W._gcOpenCollectionsDesk = openCollections; W._gcOpenCollectionsDesk.__gcOffFeat = true;
wrapDeco();

W._gcOffFeat = { collections: collections, collHtml: collHtml, openCollections: openCollections, acctCard: acctCard, inStrip: inStrip, remindCell: remindCell, todayTile: todayTile, sendReminder: sendReminder,
  expChip: expChip, expChipHtml: expChipHtml, blockWhy: blockWhy, payBlock: payBlock, payBlockHtml: payBlockHtml, subReqState: subReqState, subDoc: subDoc, hasW9: hasW9, coiExp: coiExp,
  liens: liens, cos: cos, nudge: nudge, loadCos: loadCos, wording: wordingEditor, decoBar: decoBar, wrapDeco: wrapDeco,
  state: function(){ return { coll: CM.m && CM.m.totals, sig: CM.sig, cos: COS, pending: PENDING }; } };
try { console.log('[GC] 📬 Collections · 🛡 sub papers · ⚖️ liens & waivers · ✍️ unsigned COs (patch OFFFEAT) — _gcOffFeat.state()'); } catch (e) {}
})();
