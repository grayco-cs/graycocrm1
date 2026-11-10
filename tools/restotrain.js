/* patch RESTOTRAIN — GrayCo's own 🔥 Fire & Smoke Restoration and 👃 Odor Control courses in 🎓 Training (owner 11/10: "make
   these into our own grayco fire restroation training to go in our crm under training").
   What: built-in courses (Water Damage Restoration, Fire & Smoke Restoration, Odor Control; category IICRC, required for the Insurance / Mitigation role, open to everyone) with a part per
   lesson, each with its own "✓ I read this", and a quiz part at the end of each (20 questions, pass = 16). Passing the quiz
   ticks the quiz part for that person (so 👥 Team progress shows who passed); the quiz part cannot be ticked by hand.
   A failed try shows which questions were wrong but not the answers; a pass shows every answer with the reason.
   The content lives in tools/restotrain_content.py (also the printable manuals in /training/); patch_RESTOTRAIN.py writes
   it in here as window.__GC_TRAIN_EXTRA__, and patch TRAIN's modules() adds them after the CRM videos.
   API: window.__GC_TRAIN_EXTRA__ (the courses), window.__GC_TRAIN_QUIZ__(partKey, quiz, done) → the quiz's HTML. */
(function(){
'use strict';
if (window.__GC_PATCH_RESTOTRAIN__) return; window.__GC_PATCH_RESTOTRAIN__ = true;
var W = window, D = document;
var DATA = /*__DATA__*/null;
var PASS = /*__PASS__*/16;
W.__GC_TRAIN_EXTRA__ = DATA || [];
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function qid(k){ return 'gcq_' + String(k).replace(/[^a-z0-9]+/gi, '_'); }
var LAST = {};   /* partKey → { picks, wrong } of the last try on this screen */

W.__GC_TRAIN_QUIZ__ = function(key, quiz, done){
  var id = qid(key), last = LAST[key] || null, show = !!done;
  var h = '<div class="gcq" id="' + id + '" data-gcq="' + esc(key) + '">';
  h += done ? '<div class="gcq-res ok">✅ Passed. The answers are below.</div>'
            : '<div class="gcq-res">Answer all ' + quiz.length + ' questions. You need ' + PASS + ' right to pass; the part ticks itself when you do.</div>';
  quiz.forEach(function(q, i){
    var pick = last ? last.picks[i] : -1, bad = last && !done && last.wrong.indexOf(i) >= 0;
    h += '<fieldset class="gcq-q' + (bad ? ' bad' : '') + '"><legend><b>' + (i + 1) + '.</b> ' + esc(q.q) + (bad ? ' <span class="gcq-x">✗ try again</span>' : '') + '</legend>';
    q.c.forEach(function(c, j){
      var right = show && j === q.a;
      h += '<label class="gcq-c' + (right ? ' right' : '') + '"><input type="radio" name="' + id + '_' + i + '" value="' + j + '"' + (pick === j ? ' checked' : '') + (done ? ' disabled' : '') + '> ' + esc(c) + (right ? ' ✓' : '') + '</label>';
    });
    if (show && q.why) h += '<div class="gcq-why">' + esc(q.why) + '</div>';
    h += '</fieldset>';
  });
  if (!done) h += '<p><button type="button" class="gctr-btn pri" data-gcq-grade="' + esc(key) + '">Check my answers</button>' + (last ? ' <span class="gcq-score">Last try: ' + (quiz.length - last.wrong.length) + ' of ' + quiz.length + '</span>' : '') + '</p>';
  return h + '</div>';
};

(function css(){
  if (D.getElementById('gc-restotrain-css')) return;
  var st = D.createElement('style'); st.id = 'gc-restotrain-css';
  st.textContent = [
    '.gcq{margin-top:10px}',
    '.gcq-res{background:#eef2f7;border-radius:10px;padding:8px 12px;margin:6px 0 10px;font-weight:600}',
    '.gcq-res.ok{background:#dcfce7;color:#14532d}',
    '.gcq-q{border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px;margin:0 0 8px;background:#fff}',
    '.gcq-q.bad{border-color:#fca5a5;background:#fff7f7}',
    '.gcq-q legend{padding:0 4px;font-size:14px}',
    '.gcq-c{display:block;padding:3px 0;cursor:pointer;font-size:14px}',
    '.gcq-c.right{color:#14532d;font-weight:700}',
    '.gcq-x{color:#b91c1c;font-size:12px;font-weight:700}',
    '.gcq-why{font-size:13px;color:#475569;margin-top:4px}',
    '.gcq-score{font-size:13px;color:#475569;margin-left:8px}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
})();

function quizOf(key){
  var parts = key.split('|'), mid = parts[0], pid = parts[1];
  var c = (W.__GC_TRAIN_EXTRA__ || []).filter(function(x){ return 'b:' + x.id === mid; })[0];
  var p = c && c.parts.filter(function(y){ return y.id === pid; })[0];
  return p && p.quiz;
}
function toast(m, bad){ try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = m; t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1000030;background:' + (bad ? '#7f1d1d' : '#14532d') + ';color:#fff;padding:10px 16px;border-radius:10px;font:600 14px Inter,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)'; D.body.appendChild(t); setTimeout(function(){ t.remove(); }, 4200); } catch (e) {} }

D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-gcq-grade]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var key = b.getAttribute('data-gcq-grade'), quiz = quizOf(key), box = D.getElementById(qid(key));
  if (!quiz || !box) return;
  var picks = quiz.map(function(q, i){ var r = box.querySelector('input[name="' + qid(key) + '_' + i + '"]:checked'); return r ? +r.value : -1; });
  var blank = picks.filter(function(p){ return p < 0; }).length;
  if (blank) { toast('Answer every question first (' + blank + ' left).', true); return; }
  var wrong = []; quiz.forEach(function(q, i){ if (picks[i] !== q.a) wrong.push(i); });
  var score = quiz.length - wrong.length;
  LAST[key] = { picks: picks, wrong: wrong };
  if (score >= PASS) {
    try { W._gcTrain.tick(key, true); } catch (x) {}
    toast('✅ Passed: ' + score + ' of ' + quiz.length + '. Nice work.');
  } else {
    toast(score + ' of ' + quiz.length + '. You need ' + PASS + '. The ones marked ✗ were wrong; re-read and try again.', true);
  }
  try { W._gcTrain.render(); } catch (x) {}
  var again = D.getElementById(qid(key)); if (again && again.scrollIntoView) again.scrollIntoView({ block: 'start' });
}, true);

try { console.log('[GC] 🔥 GrayCo restoration training (patch RESTOTRAIN): ' + W.__GC_TRAIN_EXTRA__.length + ' courses'); } catch (e) {}
})();
