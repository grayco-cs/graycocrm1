/* patch IICRCTRAIN — GrayCo's own IICRC-principles training documents (owner 11/11: "iicrc s 700 needs to have important stuff for
   water fire etc in the crm in our own training documents as iicrc s700 training"; "talk about masking agents and pairing agents").
   Four internal (staff-only, never client-facing) training documents, in GrayCo's own words — nothing copied from the IICRC
   standards, which are only named:
     🔥 Fire & Smoke Restoration Training (IICRC S700 principles) · 💧 Water Damage Restoration Training (IICRC S500 principles) ·
     🦠 Mold Remediation Training (IICRC S520 principles) · ☣️ Trauma, Biohazard & Sewage Safety Basics.
   Each is a printable training record: GrayCo letterhead, the sections, a knowledge check, an employee / trainer sign-off line and a
   trainer answer key (closed on screen; "Print trainee copy" leaves it out).
   Where:
     • 🎓 Training (Forms & Docs → 🎓 Training): a course per document (a part per section, "✓ I read this", the test at the end,
       pass = 80 %, score saved — patch RESTOTRAIN's quiz); Fire and Water are required for the Insurance / Mitigation role;
     • 📄 Documents: pinned "🎓 IICRC & safety training" card under the 📘 PM Playbook, and one library entry each (group Internal);
     • the Mitigation / Environmental Dashboard papers card (patch MULTICO-DOCS): a "Training" row;
     • 🧪 Materials & SDS: a training row under the title.
   The content is tools/iicrctrain_content.py; tools/patch_IICRCTRAIN.py writes it in here.
   API: window._gcIicrc = { docs, get(id), html(id), open(id, co), pin(), chips(co), coCard(co), forCo(co) } */
(function(){
'use strict';
if (window.__GC_PATCH_IICRCTRAIN__) return; window.__GC_PATCH_IICRCTRAIN__ = true;
var W = window, D = document;
var DOCS = /*__DATA__*/null || [];
var PCT = /*__PCT__*/80;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function get(id){ return DOCS.filter(function(d){ return d.id === id; })[0] || null; }
function passOf(d){ return Math.ceil(d.quiz.length * PCT / 100); }
var LINK = 'https://crm.grayco-cs.com/#gc-iicrc=';

/* ── 1. the 🎓 Training courses (patch RESTOTRAIN keeps these after its own) ── */
function course(d){
  var parts = [{ id: 'print', title: 'The printable training record', body: 'This course is also a printable training document with the same sections, the knowledge check and a sign-off line for you and your trainer.\n\n- [🖨 Open the ' + d.short + ' training record](' + LINK + d.id + ')\n- Based on the principles of ' + d.std + '. Written in GrayCo\'s own words; it is not the standard itself.' }];
  d.sections.forEach(function(s, i){ parts.push({ id: s.id, title: (i + 1) + '. ' + s.title, body: s.body }); });
  parts.push({ id: 'quiz', title: 'Test: pass ' + passOf(d) + ' of ' + d.quiz.length + ' to finish', body: 'Take it after you have read every part. Each answer shows right away; your score is saved and your manager can see it. You can retake it as many times as you need.',
    quiz: d.quiz.map(function(q){ return { q: q.q, c: q.c, a: q.a, why: q.why }; }) });
  return { id: 'iicrc-' + d.id, title: d.icon + ' ' + d.title, intro: d.intro, required: d.required, cat: d.cat, pass: passOf(d), parts: parts };
}
var X = Array.isArray(W.__GC_TRAIN_EXTRA__) ? W.__GC_TRAIN_EXTRA__ : (W.__GC_TRAIN_EXTRA__ = []);
DOCS.forEach(function(d){ if (!X.some(function(x){ return x && x.id === 'iicrc-' + d.id; })) X.push(course(d)); });

/* ── 2. the printable training document ── */
function inline(t){ return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '$1'); }
function md(t){
  var L = String(t || '').split('\n'), h = '', i = 0;
  while (i < L.length) {
    var l = L[i];
    if (!l.trim()) { i++; continue; }
    if (/^\|/.test(l)) {
      var rows = []; while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
      var cells = function(r){ return r.replace(/^\||\|$/g, '').split('|').map(function(c){ return c.trim(); }); };
      h += '<table class="iic-tbl"><thead><tr>' + cells(rows[0]).map(function(c){ return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.slice(2).map(function(r){ return '<tr>' + cells(r).map(function(c){ return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; continue;
    }
    if (/^\s*(- |\d+\. )/.test(l)) {
      var ord = /^\s*\d+\. /.test(l), its = [];
      while (i < L.length && /^\s*(- |\d+\. )/.test(L[i])) its.push(L[i++].replace(/^\s*(- |\d+\. )/, ''));
      h += (ord ? '<ol>' : '<ul>') + its.map(function(x){ return '<li>' + inline(x) + '</li>'; }).join('') + (ord ? '</ol>' : '</ul>'); continue;
    }
    var p = []; while (i < L.length && L[i].trim() && !/^\||^\s*(- |\d+\. )/.test(L[i])) p.push(L[i++]);
    h += '<p>' + inline(p.join(' ')) + '</p>';
  }
  return h;
}
var CSS = [
  'body{margin:0;background:#eef1f6;color:#0f172a;font:11pt/1.5 Arial,Helvetica,sans-serif}',
  '.iic-page{max-width:800px;margin:0 auto;background:#fff;padding:28px 36px 40px}',
  '.iic-bar{position:sticky;top:0;z-index:5;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;background:#0f2440;padding:8px 12px}',
  '.iic-bar button{border:0;border-radius:8px;padding:8px 14px;font:700 13px Arial,sans-serif;cursor:pointer;background:#d4a017;color:#0f172a}',
  '.iic-bar button.ghost{background:#fff}',
  '.iic-title{background:#0f2440;color:#fff;border-radius:10px;padding:16px 20px;margin:4px 0 12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.iic-title h1{margin:0;font-size:19pt;line-height:1.2}',
  '.iic-title .sub{color:#f3d27a;font-weight:700;margin-top:4px}',
  '.iic-tag{display:inline-block;background:#fee2e2;color:#7f1d1d;border-radius:6px;padding:2px 8px;font:700 9pt Arial,sans-serif;margin-top:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.iic-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:0 0 12px}',
  '.iic-meta div{border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:9.5pt}',
  '.iic-meta b{display:block;color:#0f2440;font-size:10.5pt}',
  '.iic-note{background:#fdf6e3;border-left:4px solid #d4a017;padding:8px 12px;border-radius:6px;font-size:9.5pt;margin:0 0 12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.iic-toc{columns:2;font-size:10pt;margin:0 0 8px;padding-left:20px}',
  'h2{font-size:13.5pt;color:#0f2440;border-bottom:2px solid #d4a017;padding-bottom:3px;margin:20px 0 8px;break-after:avoid;page-break-after:avoid}',
  'section{break-inside:auto}',
  'ul,ol{margin:4px 0 8px;padding-left:22px}li{margin:2px 0}p{margin:6px 0}',
  '.iic-tbl{width:100%;border-collapse:collapse;font-size:9.5pt;margin:6px 0 10px;break-inside:avoid;page-break-inside:avoid}.iic-tbl th,.iic-tbl td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}.iic-tbl th{background:#0f2440;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.iic-q{break-inside:avoid;page-break-inside:avoid;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin:0 0 8px}',
  '.iic-q .c{display:block;margin:3px 0 0 8px}',
  '.iic-sign{border:2px solid #0f2440;border-radius:10px;padding:12px 16px;margin-top:16px;break-inside:avoid;page-break-inside:avoid}',
  '.iic-sign table{width:100%;border-collapse:collapse;margin-top:8px}',
  '.iic-sign td{padding:12px 6px 4px;vertical-align:bottom;font-size:10pt;width:33%}',
  '.iic-line{border-bottom:1px solid #334155;height:20px;margin-bottom:2px}',
  'details.iic-key{margin-top:20px;border:2px dashed #b91c1c;border-radius:10px;padding:10px 14px}',
  'details.iic-key summary{cursor:pointer;font-weight:800;color:#b91c1c}',
  '.iic-key table{width:100%;border-collapse:collapse;font-size:10pt;margin-top:8px}',
  '.iic-key td,.iic-key th{border:1px solid #e2e8f0;padding:4px 6px;text-align:left;vertical-align:top}',
  '.iic-foot{margin-top:18px;font-size:8.5pt;color:#64748b;text-align:center}',
  '@media print{body{background:#fff}.iic-page{padding:0;max-width:none}.iic-bar{display:none}details.iic-key{break-before:page;page-break-before:always}body.nokey details.iic-key{display:none}@page{margin:.6in}}',
  '@media (max-width:600px){.iic-page{padding:16px}.iic-toc{columns:1}}'
].join('\n');
function html(id){
  var d = get(id); if (!d) return null;
  var n = d.quiz.length, P = passOf(d), h = '';
  h += '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(d.title) + '</title><style>' + CSS + '</style></head><body>';
  h += '<div class="iic-bar"><button type="button" onclick="document.body.classList.add(\'nokey\');window.print();setTimeout(function(){document.body.classList.remove(\'nokey\')},500)">🖨 Print trainee copy (no answer key)</button>' +
    '<button type="button" class="ghost" onclick="var k=document.querySelector(\'details.iic-key\');if(k)k.open=true;window.print()">🖨 Print with answer key</button></div>';
  var head = ''; try { head = W._gcPrintHead ? W._gcPrintHead() : ''; } catch (e) {}   /* the letterhead (the company's, on a Mitigation / Environmental Dashboard) */
  h += '<div class="iic-page" data-iicrc-doc="' + esc(d.id) + '">' + head;
  h += '<div class="iic-title"><h1>' + esc(d.icon) + ' ' + esc(d.title) + '</h1><div class="sub">Based on the principles of ' + esc(d.std) + '</div><span class="iic-tag">INTERNAL — GRAYCO STAFF TRAINING · NOT FOR CUSTOMERS</span></div>';
  h += '<div class="iic-meta"><div><b>Who</b>' + (d.required.length ? 'Required: Insurance / Mitigation crews, supers and PMs. Open to all staff.' : 'Everyone who may work this kind of job.') + '</div><div><b>Time</b>About ' + Math.max(30, d.sections.length * 4) + ' minutes, plus the knowledge check</div><div><b>Knowledge check</b>' + n + ' questions · pass = ' + P + ' of ' + n + '</div><div><b>Record</b>Sign below; keep in the employee\'s training file (🎓 Training → 📜 Certifications)</div></div>';
  h += '<div class="iic-note"><b>About this document.</b> ' + esc(d.intro) + ' It summarizes common restoration practice in our own words; it is not the IICRC standard and does not replace it or IICRC certification classes. Always follow the product label and SDS, OSHA rules, local codes and your supervisor; where GrayCo policy is stricter, follow GrayCo policy. Take the same test in the CRM: 📄 Forms &amp; Docs → 🎓 Training.</div>';
  h += '<b>Contents</b><ol class="iic-toc">' + d.sections.map(function(s){ return '<li>' + esc(s.title) + '</li>'; }).join('') + '<li>Knowledge check &amp; sign-off</li></ol>';
  d.sections.forEach(function(s, i){ h += '<section id="iic-' + esc(s.id) + '"><h2>' + (i + 1) + '. ' + esc(s.title) + '</h2>' + md(s.body) + '</section>'; });
  h += '<section class="iic-quiz"><h2>' + (d.sections.length + 1) + '. Knowledge check</h2><p>Circle the best answer for each question. You need <b>' + P + ' of ' + n + '</b> to pass.</p>';
  d.quiz.forEach(function(q, i){ h += '<div class="iic-q"><b>' + (i + 1) + '.</b> ' + esc(q.q) + q.c.map(function(c, j){ return '<span class="c">☐ ' + 'ABCD'.charAt(j) + '. ' + esc(c) + '</span>'; }).join('') + '</div>'; });
  h += '</section>';
  h += '<div class="iic-sign"><b>Training sign-off</b><div style="font-size:9.5pt;margin-top:4px">I have read this training, my trainer went over it with me, I had the chance to ask questions, and I will follow it on the job.</div><table>' +
    '<tr><td><div class="iic-line"></div>Employee name (print)</td><td><div class="iic-line"></div>Employee signature</td><td><div class="iic-line"></div>Date</td></tr>' +
    '<tr><td><div class="iic-line"></div>Trainer name (print)</td><td><div class="iic-line"></div>Trainer signature</td><td><div class="iic-line"></div>Date</td></tr>' +
    '<tr><td><div class="iic-line"></div>Score (of ' + n + '; pass = ' + P + ')</td><td>☐ Passed &nbsp; ☐ Retrain needed</td><td><div class="iic-line"></div>Retrain date (if needed)</td></tr></table></div>';
  h += '<details class="iic-key"><summary>🔑 Answer key — trainers / admins only (closed on screen; not printed on the trainee copy)</summary><table><thead><tr><th>#</th><th>Answer</th><th>Why</th></tr></thead><tbody>' +
    d.quiz.map(function(q, i){ return '<tr><td>' + (i + 1) + '</td><td><b>' + 'ABCD'.charAt(q.a) + '</b>. ' + esc(q.c[q.a]) + '</td><td>' + esc(q.why) + '</td></tr>'; }).join('') + '</tbody></table></details>';
  h += '<div class="iic-foot">GrayCo internal training · ' + esc(d.short) + ' · Based on the principles of ' + esc(d.std) + '. IICRC and the S500 / S520 / S700 standards belong to the IICRC; this document is GrayCo\'s own summary of common practice, not a copy of them.</div>';
  return h + '</div></body></html>';
}

/* ── 3. opening one (the document library when it is there, so the letterhead and its viewer are the usual ones) ── */
function openHtml(h){
  var w = null; try { w = W.open('', '_blank'); } catch (e) {}
  if (w) { try { w.document.open(); w.document.write(h); w.document.close(); return true; } catch (e) {} }
  if (W._gcDocOverlay) return W._gcDocOverlay(h, 'Training');
  return false;
}
function open(id, co){
  if (!get(id)) return false;
  try { if (co && co !== 'all' && W._gcDocCo && W._gcDocCo.set) W._gcDocCo.set(co); } catch (e) {}
  try { if (W._gcDocs3 && W._gcDocs3.launch) { W._gcDocs3.launch('fn:iicrc_' + id); return true; } } catch (e) {}
  return openHtml(html(id));
}

/* ── 4. where they are listed ── */
function forCo(co){ return DOCS.filter(function(d){ return !co || co === 'all' || d.cos.indexOf(co) >= 0; }); }
function pin(){
  return '<div class="gc-dl-card gc-dl-pin" data-docid="iicrc_training" style="margin:10px 20px 0;border:2px solid #d4a017;background:#13243b">' +
    '<div class="gc-dl-icon" title="Pinned">🎓</div>' +
    '<div class="gc-dl-info"><div class="gc-dl-title">🎓 IICRC &amp; safety training <span style="font-size:10px;font-weight:800;letter-spacing:.06em;color:#0a1628;background:#d4a017;border-radius:4px;padding:2px 6px;margin-left:4px;vertical-align:middle">BUILT-IN</span></div>' +
    '<div class="gc-dl-desc">GrayCo\'s own training records with a quiz and sign-off: fire &amp; smoke (S700), water (S500), mold (S520), biohazard &amp; sewage. Internal only. Take the tests in 🎓 Training.</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' + DOCS.map(function(d){ return '<button type="button" class="gc-dl-btn" data-iicrc-open="' + esc(d.id) + '">' + esc(d.icon + ' ' + d.short) + '</button>'; }).join('') + '</div></div></div>';
}
function chips(co){
  var L = forCo(co); if (!L.length) return '';
  return '<div class="chips" data-iicrc-chips="1" style="margin:4px 0 10px"><span class="m">🎓 Training:</span> ' + L.map(function(d){ return '<button type="button" class="gcsds-btn" data-iicrc-open="' + esc(d.id) + '"' + (co && co !== 'all' ? ' data-iicrc-co="' + esc(co) + '"' : '') + '>' + esc(d.icon + ' ' + d.short) + '</button>'; }).join(' ') + '</div>';
}
function coCard(co){
  var L = forCo(co); if (!L.length) return '';
  return '<div style="font:700 12px Inter,Arial,sans-serif;color:#64748b;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.05em">🎓 Training (internal)</div><div data-iicrc-co-card="1" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px">' +
    L.map(function(d){ return '<button type="button" data-iicrc-open="' + esc(d.id) + '" data-iicrc-co="' + esc(co) + '" style="text-align:left;border:1px solid #e2e8f0;border-left:4px solid #d4a017;background:#fff;border-radius:8px;padding:8px 10px;cursor:pointer;font:13px Inter,Arial,sans-serif;color:#0f172a">' + esc(d.icon + ' ' + d.title) + '<br><span style="font-size:11.5px;color:#64748b">Training record · ' + d.quiz.length + '-question quiz · sign-off</span></button>'; }).join('') + '</div>';
}

/* the 📄 Documents header: our card under the PM Playbook's */
(function wrapPin(n){
  var P0 = W._gcPlaybookPin;
  if (typeof P0 === 'function') { if (!P0.__iicrc) { var P1 = function(){ var a = ''; try { a = P0.apply(this, arguments); } catch (e) {} return a + pin(); }; P1.__iicrc = 1; W._gcPlaybookPin = P1; } return; }
  if (n < 40) setTimeout(function(){ wrapPin(n + 1); }, 500); else W._gcPlaybookPin = pin;
})(0);

D.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target.closest('[data-iicrc-open],a[href*="#gc-iicrc="]') : null; if (!t) return;
  var id = t.getAttribute('data-iicrc-open') || (String(t.getAttribute('href')).split('#gc-iicrc=')[1] || '');
  if (!get(id)) return;
  e.preventDefault(); e.stopPropagation();
  open(id, t.getAttribute('data-iicrc-co') || '');
}, true);

W._gcIicrc = { docs: DOCS, get: get, html: html, open: open, pin: pin, chips: chips, coCard: coCard, forCo: forCo, passOf: passOf };
try { console.log('[GC] 🎓 IICRC-principles training documents (patch IICRCTRAIN): ' + DOCS.length); } catch (e) {}
})();
