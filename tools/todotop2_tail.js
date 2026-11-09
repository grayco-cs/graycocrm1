<script>/*__GC_PATCH_TODOTOP2__ (owner 11/9, screenshot of the bottom of To-Do: "this stuff at bottom i want list and count at top of page")
  A short list at the TOP of the To-Do page: 🧾 Missing job data · 📥 Needs a job · 🔧 Owner setup · 📧 Receipts e-mailed in,
  each with its count. A tap opens it (the same button below) or scrolls to it. The cards below stay where they are. */
(function(W){
'use strict';
var D = W.document;
function txt(e){ return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
function num(re, t){ var m = re.exec(t); return m ? +m[1] : null; }
function items(){
  var out = [], b;
  [].some.call(D.querySelectorAll('[data-df-banner]'), function(b0){ var n = num(/(\d+)\s+of\s+\d+\s+jobs? need/i, txt(b0)); if (n) { out.push({ k: 'df', ic: '🧾', l: 'Missing job data', n: n, el: b0, go: b0.querySelector('button') }); return true; } return false; });
  [].some.call(D.querySelectorAll('[data-mn="needs"]'), function(b0){ var n2 = num(/\((\d+)\)/, txt(b0)); if (n2) { out.push({ k: 'nj', ic: '📥', l: 'Needs a job', n: n2, el: b0, go: b0 }); return true; } return false; });
  if ((b = D.getElementById('gc-ot'))) { var n3 = num(/(\d+)\s+left/i, txt(b.querySelector('summary') || b)); if (n3) out.push({ k: 'ot', ic: '🔧', l: 'Owner setup', n: n3, el: b, go: null }); }
  [].some.call(D.querySelectorAll('[data-mm-open]'), function(b0){ var n4 = num(/\((\d+)\)/, txt(b0)); if (n4) { out.push({ k: 'mm', ic: '📧', l: 'Receipts e-mailed in', n: n4, el: b0, go: b0 }); return true; } return false; });
  return out;
}
var LAST = [];
function paint(){
  try {
    var mount = D.getElementById('_todoMount'), cur = D.getElementById('gc-tt2');
    if (!mount || D.hidden) { if (cur && !mount) cur.remove(); return; }
    var L = items(); LAST = L;
    if (!L.length) { if (cur) cur.remove(); return; }
    var main = mount.parentElement; if (!main) return;
    if (!D.getElementById('gc-tt2-css')) { var sc = D.createElement('style'); sc.id = 'gc-tt2-css';
      /* owner 11/9 (2nd screenshot): the big cards go to the BOTTOM, under the To-Do; the short list stays on top. Done with CSS order so
         the cards' own code (which puts them back above the To-Do every few seconds) never fights a move — no lag */
      sc.textContent = ':has(> #_todoMount){display:flex!important;flex-direction:column}:has(> #_todoMount) > *{order:10}:has(> #_todoMount) > #gc-tt2{order:0}:has(> #_todoMount) > #_todoMount{order:20}'
        + ':has(> #_todoMount) > #gc-money-needs,:has(> #_todoMount) > #gc-ot,:has(> #_todoMount) > #gc-mm,:has(> #_todoMount) > .gc-df-banner,:has(> #_todoMount) > [data-df-banner],:has(> #_todoMount) > #gc-exp2-todo,:has(> #_todoMount) > #gc-sl-todo{order:30;margin-top:10px}';
      D.head.appendChild(sc); }
    var sig = L.map(function(x){ return x.k + x.n; }).join('|');
    if (!cur) { cur = D.createElement('div'); cur.id = 'gc-tt2'; cur.setAttribute('data-gc-keep', '1');
      cur.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px 10px;margin:0 0 12px;font:14px Inter,Arial,sans-serif;color:#0f172a;display:flex;flex-wrap:wrap;gap:8px;align-items:center'; }
    if (cur.getAttribute('data-sig') !== sig) {
      cur.setAttribute('data-sig', sig);
      cur.innerHTML = '<b style="font-size:13px;color:#475569;margin-right:4px">Also waiting:</b>' + L.map(function(x, i){
        return '<button type="button" data-tt2="' + i + '" style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:6px 12px;font:600 13px Inter,Arial,sans-serif;cursor:pointer;min-height:36px;color:#0f172a">' + x.ic + ' ' + x.l +
          ' <span style="background:#0f1d2f;color:#fff;border-radius:999px;padding:1px 8px;font-size:12px">' + x.n + '</span></button>'; }).join('');
    }
    if (cur.parentElement !== main) main.insertBefore(cur, main.firstElementChild);
  } catch (e) {}
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('#gc-tt2 [data-tt2]') : null; if (!b) return;
  var x = LAST[+b.getAttribute('data-tt2')]; if (!x) return;
  try { if (x.k === 'ot' && x.el.tagName === 'DETAILS') x.el.open = true; x.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (x.go) setTimeout(function(){ try { x.go.click(); } catch (er) {} }, 350); } catch (er) {}
});
setInterval(paint, 2500);
W._gcTodoTop2 = { items: items, paint: paint };
})(window);
</script>
