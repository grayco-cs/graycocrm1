/* patch RESTOTRAIN — GrayCo's own training courses in 🎓 Training (owner 11/10: "make these into our own grayco fire restroation
   training to go in our crm under training"; "make these have tests … once you click it shows the answer and marks their score").
   What: built-in courses (Water Damage Restoration, Fire & Smoke Restoration, Odor Control; category IICRC, required for the
   Insurance / Mitigation role, open to everyone) with a part per lesson, each with its own "✓ I read this", and a test at the
   end of each (20 questions, pass = 16; a course may set its own `pass`, e.g. patch IICRCTRAIN's 80 %).
   The test: tap an answer and it locks in and shows right away — ✓ right, or ✗ with the correct answer and the reason — with a
   running score at the top. When every question is answered the score is saved for that person (gc_train_p_<email>, on the
   test part: { score, of, best, tries, passed }): a pass ticks the test part (it cannot be ticked by hand), a fail keeps the
   score and offers "Retake the test". A later lower score never un-passes anyone. 👥 Team progress lists every test score.
   The content lives in tools/restotrain_content.py (also the printable manuals in /training/); patch_RESTOTRAIN.py writes
   it in here as window.__GC_TRAIN_EXTRA__, and patch TRAIN's modules() adds them after the CRM videos.
   API: window.__GC_TRAIN_EXTRA__ (the courses), __GC_TRAIN_QUIZ__(partKey, quiz, done) → the test's HTML,
        __GC_TRAIN_TESTS__(doneMap) → [{ key, course, score, of, best, tries, passed, at }], __GC_TRAIN_TESTROWS__(teamRows) → HTML. */
(function(){
'use strict';
if (window.__GC_PATCH_RESTOTRAIN__) return; window.__GC_PATCH_RESTOTRAIN__ = true;
var W = window, D = document;
var DATA = /*__DATA__*/null;
var PASS = /*__PASS__*/16;
W.__GC_TRAIN_EXTRA__ = (DATA || []).concat(Array.isArray(W.__GC_TRAIN_EXTRA__) ? W.__GC_TRAIN_EXTRA__ : []);   /* patch IICRCTRAIN: courses added before this keep their place, after ours */
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function qid(k){ return 'gcq_' + String(k).replace(/[^a-z0-9]+/gi, '_'); }
function rec(key){ try { var P = W._gcTrain && W._gcTrain._p && W._gcTrain._p(); var r = P && P.done && P.done[key]; return r && typeof r === 'object' ? r : null; } catch (e) { return null; } }
function fmtDay(iso){ try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
var TRY = {};   /* partKey → { picks: [...] } — the test in progress on this screen */

function courseOf(key){ var mid = String(key).split('|')[0]; return (W.__GC_TRAIN_EXTRA__ || []).filter(function(x){ return 'b:' + x.id === mid; })[0] || null; }
function passOf(key, n){ var c = courseOf(key); if (c && c.passPct && n) return Math.ceil(n * c.passPct / 100); return (c && c.pass) || PASS; }   /* patch IICRCTRAIN: a course can set its own pass mark (a number, or passPct of the questions asked) */
function drawOf(key, quiz){ var c = courseOf(key); return c && c.draw && c.draw < quiz.length ? c.draw : 0; }   /* patch IICRCTRAIN: ask `draw` questions from a bigger bank */
function sample(key, quiz){ var n = drawOf(key, quiz); if (!n) return quiz; var a = quiz.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a.slice(0, n); }
function quizOf(key){ var c = courseOf(key), pid = String(key).split('|')[1]; var p = c && c.parts.filter(function(y){ return y.id === pid; })[0]; return p && p.quiz; }

W.__GC_TRAIN_QUIZ__ = function(key, quiz, done){
  var id = qid(key), r = rec(key), t = TRY[key];
  var h = '<div class="gcq" id="' + id + '" data-gcq="' + esc(key) + '">';
  if (!t) {
    /* not taking it right now: the saved result and a start / retake button */
    if (r && r.of) {
      h += '<div class="gcq-res' + (r.passed ? ' ok' : ' bad') + '">' + (r.passed ? '✅ Passed' : '✗ Not passed yet') + ' · last score <b>' + esc(r.score) + ' of ' + esc(r.of) + '</b>' +
        (r.best != null && r.best !== r.score ? ' · best ' + esc(r.best) + ' of ' + esc(r.of) : '') + ' · ' + esc(r.tries || 1) + ' tr' + ((r.tries || 1) === 1 ? 'y' : 'ies') + (r.at ? ' · ' + esc(fmtDay(r.at)) : '') + '</div>';
      h += '<p><button type="button" class="gctr-btn' + (r.passed ? '' : ' pri') + '" data-gcq-start="' + esc(key) + '">' + (r.passed ? '↻ Take the test again' : '↻ Retake the test') + '</button></p>';
    } else if (done) {
      h += '<div class="gcq-res ok">✅ Passed.</div><p><button type="button" class="gctr-btn" data-gcq-start="' + esc(key) + '">↻ Take the test again</button></p>';
    } else {
      var dn = drawOf(key, quiz), nq = dn || quiz.length;
      h += '<div class="gcq-res">' + nq + ' questions' + (dn ? ', drawn at random from a bank of ' + quiz.length + ' (a new set every try)' : '') + '. Tap an answer and it shows right away whether you got it. You need ' + passOf(key, nq) + ' right to pass; your score is saved and this part ticks itself when you pass.</div>' +
        '<p><button type="button" class="gctr-btn pri" data-gcq-start="' + esc(key) + '">▶ Start the test</button></p>';
    }
    return h + '</div>';
  }
  quiz = t.qs || quiz;   /* patch IICRCTRAIN: the questions drawn for this try */
  var answered = 0, right = 0;
  t.picks.forEach(function(p, i){ if (p >= 0) { answered++; if (p === quiz[i].a) right++; } });
  var finished = answered === quiz.length;
  h += '<div class="gcq-bar"><b>Score: ' + right + ' of ' + answered + '</b> answered · ' + (quiz.length - answered) + ' left · pass = ' + passOf(key, quiz.length) + ' of ' + quiz.length + '</div>';
  if (finished) {
    var pass = right >= passOf(key, quiz.length);
    h += '<div class="gcq-res ' + (pass ? 'ok' : 'bad') + '">' + (pass ? '✅ Passed: ' : '✗ Not passed: ') + right + ' of ' + quiz.length + '. ' + (pass ? 'Your score is saved and this part is ticked.' : 'Your score is saved. Re-read the parts you missed and retake it.') +
      ' <button type="button" class="gctr-btn" data-gcq-start="' + esc(key) + '" style="margin-left:8px">↻ Retake</button> <button type="button" class="gctr-btn" data-gcq-close="' + esc(key) + '">Close</button></div>';
  }
  quiz.forEach(function(q, i){
    var pick = t.picks[i], has = pick >= 0, ok = has && pick === q.a;
    h += '<fieldset class="gcq-q' + (has ? (ok ? ' good' : ' bad') : '') + '"><legend><b>' + (i + 1) + '.</b> ' + esc(q.q) + (has ? (ok ? ' <span class="gcq-ok">✓ Correct</span>' : ' <span class="gcq-x">✗ Wrong</span>') : '') + '</legend>';
    q.c.forEach(function(c, j){
      var cls = has ? (j === q.a ? ' right' : j === pick ? ' wrong' : ' dim') : '';
      h += '<button type="button" class="gcq-c' + cls + '" data-gcq-pick="' + esc(key) + '" data-i="' + i + '" data-j="' + j + '"' + (has ? ' disabled' : '') + '>' + 'ABCD'.charAt(j) + '. ' + esc(c) + (has && j === q.a ? ' ✓' : has && j === pick ? ' ✗' : '') + '</button>';
    });
    if (has && q.why) h += '<div class="gcq-why">' + (ok ? '' : '<b>Answer: ' + 'ABCD'.charAt(q.a) + '.</b> ') + esc(q.why) + '</div>';
    h += '</fieldset>';
  });
  return h + '</div>';
};

/* the saved scores, for 👥 Team progress */
W.__GC_TRAIN_TRY__ = function(key){ return TRY[key] || null; }   /* the test in progress (for tests) */
W.__GC_TRAIN_TESTS__ = function(doneMap){
  var out = [];
  Object.keys(doneMap || {}).forEach(function(k){
    var r = doneMap[k]; if (!r || typeof r !== 'object' || !r.of) return;
    var c = courseOf(k); if (!c) return;
    out.push({ key: k, course: c.title, score: r.score, of: r.of, best: r.best, tries: r.tries || 1, passed: !!r.passed, at: r.at });
  });
  return out;
};
W.__GC_TRAIN_TESTROWS__ = function(rows){
  var list = [];
  (rows || []).forEach(function(r){ (r.tests || []).forEach(function(t){ list.push({ who: r.name, t: t }); }); });
  var h = '<div style="margin-top:14px"><b>📝 Test scores</b> <span class="gctr-when">(pass = 80 % of each test)</span>';
  if (!list.length) return h + '<div class="gctr-when">Nobody has taken a test yet.</div></div>';
  list.sort(function(a, b){ return a.who.localeCompare(b.who) || a.t.course.localeCompare(b.t.course); });
  return h + '<div class="gctr-grid"><table><thead><tr><th>Person</th><th>Test</th><th>Last score</th><th>Best</th><th>Tries</th><th>Result</th><th>Date</th></tr></thead><tbody>' +
    list.map(function(x){ var t = x.t; return '<tr><td>' + esc(x.who) + '</td><td>' + esc(t.course) + '</td><td>' + esc(t.score) + ' / ' + esc(t.of) + '</td><td>' + esc(t.best != null ? t.best : t.score) + '</td><td>' + esc(t.tries) + '</td><td class="' + (t.passed ? 'gctr-ok' : 'gctr-part0') + '">' + (t.passed ? 'Passed' : 'Not yet') + '</td><td>' + esc(t.at ? fmtDay(t.at) : '') + '</td></tr>'; }).join('') +
    '</tbody></table></div></div>';
};

(function css(){
  if (D.getElementById('gc-restotrain-css')) return;
  var st = D.createElement('style'); st.id = 'gc-restotrain-css';
  st.textContent = [
    '.gcq{margin-top:10px}',
    '.gcq-bar{position:sticky;top:0;z-index:2;background:#0f2440;color:#fff;border-radius:10px;padding:8px 12px;margin:6px 0 10px;font-size:14px}',
    '.gcq-res{background:#eef2f7;border-radius:10px;padding:8px 12px;margin:6px 0 10px;font-weight:600}',
    '.gcq-res.ok{background:#dcfce7;color:#14532d}',
    '.gcq-res.bad{background:#fee2e2;color:#7f1d1d}',
    '.gcq-q{border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px;margin:0 0 8px;background:#fff}',
    '.gcq-q.good{border-color:#86efac;background:#f6fef8}',
    '.gcq-q.bad{border-color:#fca5a5;background:#fff7f7}',
    '.gcq-q legend{padding:0 4px;font-size:14px}',
    '.gcq-c{display:block;width:100%;text-align:left;margin:4px 0;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;font:14px Inter,Arial,sans-serif;cursor:pointer}',
    '.gcq-c:hover:not([disabled]){border-color:#0f2440;background:#f1f5f9}',
    '.gcq-c[disabled]{cursor:default}',
    '.gcq-c.right{border-color:#16a34a;background:#dcfce7;color:#14532d;font-weight:700}',
    '.gcq-c.wrong{border-color:#dc2626;background:#fee2e2;color:#7f1d1d;font-weight:700}',
    '.gcq-c.dim{opacity:.6}',
    '.gcq-ok{color:#15803d;font-size:12px;font-weight:700}',
    '.gcq-x{color:#b91c1c;font-size:12px;font-weight:700}',
    '.gcq-why{font-size:13px;color:#334155;margin-top:4px}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
})();

function toast(m, bad){ try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = m; t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1000030;background:' + (bad ? '#7f1d1d' : '#14532d') + ';color:#fff;padding:10px 16px;border-radius:10px;font:600 14px Inter,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)'; D.body.appendChild(t); setTimeout(function(){ t.remove(); }, 4200); } catch (e) {} }
function repaint(key, scroll){
  var box = D.getElementById(qid(key)), quiz = quizOf(key); if (!box || !quiz) return;
  var done = false; try { done = W._gcTrain.isDone(key); } catch (e) {}
  var y = scroll ? null : W.scrollY;
  box.outerHTML = W.__GC_TRAIN_QUIZ__(key, quiz, done);
  if (scroll) { var b = D.getElementById(qid(key)); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'start' }); }
}
function save(key, quiz, picks){
  var right = 0; picks.forEach(function(p, i){ if (p === quiz[i].a) right++; });
  var prev = rec(key) || {}, pass = right >= passOf(key, quiz.length), was = !!prev.passed || (prev.on !== false && !!prev.at && !prev.of);
  var extra = { score: right, of: quiz.length, best: Math.max(right, prev.best || 0), tries: (prev.tries || 0) + 1, passed: pass || was };
  try { W._gcTrain.tick(key, pass || was, extra); } catch (e) {}
  if (pass) toast('✅ Passed: ' + right + ' of ' + quiz.length + '. Your score is saved.');
  else toast(right + ' of ' + quiz.length + '. You need ' + passOf(key, quiz.length) + ' to pass. Your score is saved; retake it when you are ready.', true);
  try { W._gcTrain.render(); } catch (e) {}
}

D.addEventListener('click', function(e){
  var el = e.target && e.target.closest ? e.target.closest('[data-gcq-pick],[data-gcq-start],[data-gcq-close]') : null; if (!el) return;
  e.preventDefault(); e.stopPropagation();
  var key = el.getAttribute('data-gcq-pick') || el.getAttribute('data-gcq-start') || el.getAttribute('data-gcq-close'), quiz = quizOf(key);
  if (!quiz) return;
  if (el.hasAttribute('data-gcq-close')) { delete TRY[key]; repaint(key, true); return; }
  if (el.hasAttribute('data-gcq-start')) { var qs = sample(key, quiz); TRY[key] = { qs: qs, picks: qs.map(function(){ return -1; }) }; repaint(key, true); return; }
  var t = TRY[key]; if (!t) return;
  var i = +el.getAttribute('data-i'), j = +el.getAttribute('data-j');
  if (t.picks[i] >= 0) return;
  t.picks[i] = j;
  var finished = t.picks.every(function(p){ return p >= 0; });
  if (finished) save(key, t.qs || quiz, t.picks);
  repaint(key, false);
}, true);

try { console.log('[GC] 🎓 GrayCo restoration training (patch RESTOTRAIN): ' + W.__GC_TRAIN_EXTRA__.length + ' courses, tests with saved scores'); } catch (e) {}
})();
