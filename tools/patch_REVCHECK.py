# REVCHECK (owner 11/24: "saw 1.6 million on this earlier … I think it's messed up somewhere — make sure that's always good"):
# the 1.6M was the old number from before the 11/20 QuickBooks-only cleanup (CRM copies of QuickBooks invoices + CRM-only draws on past
# jobs). The Company dashboard's Revenue (billed) tile now says, under the number, how much of it is QuickBooks invoices and how much is
# CRM-only (new invoices not in QuickBooks yet) — and warns in amber when a CRM invoice looks like a copy of a QuickBooks one (same
# customer and amount, the thing that inflated it). Looks only, changes nothing. Runs only while the Company view's tile is on screen.
def sub(p, a, b, n=1):
    t = open(p, encoding='utf-8').read(); assert t.count(a) == n, (p, a[:70], t.count(a)); open(p, 'w', encoding='utf-8').write(t.replace(a, b))
A = "<script>\n/* ============================================================================\n   GrayCo — WHERE THE REVENUE NUMBER COMES FROM."
sub('index.html', A, r"""<script>
/* patch REVCHECK (owner 11/24): under the Company dashboard's Revenue (billed): "QuickBooks $X · CRM-only $Y", amber when a CRM invoice
   looks like a copy of a QuickBooks one. The same rule as the tile (client invoices of the year, not draft / void / archived / deleted,
   one per id). Looks only. */
(function(){
'use strict';
var W = window, D = document, last = '';
function s(x){ return x == null ? '' : String(x).trim(); }
function low(x){ return s(x).toLowerCase(); }
function num(x){ var n = parseFloat(x); return isNaN(n) ? 0 : n; }
function isQB(r){ return /^QB:invoice:/i.test(s(r.qbKey)) || (Array.isArray(r.qbKeys) && r.qbKeys.some(function(k){ return /^QB:invoice:/i.test(s(k)); })) || !!s(r.qbNum) || ((/quickbooks/i.test(s(r.source)) || r.importedHistory === true) && !!s(r.invNum)); }
function money(n){ return '$' + Math.round(n).toLocaleString(); }
function calc(year){
  var I = (W._crm && (W._crm.invs || W._crm.invoices)) || [], seen = {}, qb = 0, crm = 0, nCrm = 0, Q = [], C = [];
  I.forEach(function(v){
    if (!v || v.type !== 'client' || v._archived || v._dupOf) return;
    var st = low(v.status); if (/^(draft|void|denied|cancell?ed|deleted)$/.test(st)) return;
    var d = s(v.recvDate || v.date); if (d && d.slice(0, 4) !== String(year)) return;
    try { if (W._gcIsTombstoned && (W._gcIsTombstoned('invs', v.id) || W._gcIsTombstoned('invoices', v.id))) return; } catch (e) {}
    var a = Math.abs(num(v.amt != null ? v.amt : v.amount)); if (!(a > 0)) return;
    if (v.id && seen[v.id]) return; if (v.id) seen[v.id] = 1;
    if (isQB(v)) { qb += a; Q.push(v); } else { crm += a; nCrm++; C.push(v); }
  });
  var cust = function(v){ return low(v.client || v.customer).replace(/[^a-z0-9]/g, ''); };
  var copies = C.filter(function(c){ var k = cust(c), a = Math.abs(num(c.amt != null ? c.amt : c.amount)); return k && Q.some(function(q){ return cust(q) === k && Math.abs(Math.abs(num(q.amt != null ? q.amt : q.amount)) - a) <= 1; }); });
  return { qb: qb, crm: crm, nCrm: nCrm, copies: copies };
}
function tick(){
  try {
    if (D.hidden || !/Company-wide view/.test((D.body && D.body.innerText || '').slice(0, 4000))) return;
    var lab = null, els = D.querySelectorAll('div,span');
    for (var i = 0; i < els.length && i < 4000; i++) { var e = els[i]; if (e.childElementCount === 0 && /^revenue \(billed\)$/i.test(s(e.textContent))) { lab = e; break; } }
    if (!lab) return;
    var tile = lab.parentElement; if (!tile) return;
    var ys = [].slice.call(D.querySelectorAll('select')).map(function(x){ return s(x.value); }).filter(function(v){ return /^20\d\d$/.test(v); });
    var year = ys[0] || String(new Date().getFullYear());
    var r = calc(year), key = year + '|' + Math.round(r.qb) + '|' + Math.round(r.crm) + '|' + r.copies.length;
    var box = tile.querySelector('[data-revcheck]');
    if (box && key === last) return;
    last = key;
    if (!box) { box = D.createElement('div'); box.setAttribute('data-revcheck', '1'); box.style.cssText = 'font-size:11px;line-height:1.35;margin-top:3px;font-weight:600'; tile.appendChild(box); }
    var warn = r.copies.length > 0;
    box.style.color = warn ? '#b45309' : '#64748b';
    box.textContent = (warn ? '⚠ ' + r.copies.length + ' CRM invoice' + (r.copies.length === 1 ? '' : 's') + ' look like a copy of a QuickBooks one · ' : '✓ ') + 'QuickBooks ' + money(r.qb) + (r.crm > 0.5 ? ' · CRM-only ' + money(r.crm) + ' (' + r.nCrm + ')' : '');
    box.title = warn ? 'Same customer and amount as a QuickBooks invoice: ' + r.copies.slice(0, 8).map(function(c){ return s(c.client || c.customer) + ' ' + money(num(c.amt)) + ' ' + s(c.date).slice(0, 10); }).join('; ') : 'QuickBooks invoices + invoices made in the CRM that are not in QuickBooks yet';
  } catch (e) {}
}
setInterval(tick, 3000); setTimeout(tick, 1500);
W._gcRevCheck = function(y){ return calc(y || new Date().getFullYear()); };
})();
</script>
""" + A)
print('REVCHECK: done')
