#!/usr/bin/env python3
"""Idempotent patch BIDFILTER: the Bid boards screen (Leads -> 🔎 Bid boards) for the always-on construction gate.

  * "All public bids" is now "All construction bids, any trade" + the line "Only construction work becomes a lead.
    Equipment, vehicles, supplies and services are skipped."
  * the keyword / leave-out lists the server sends are already merged with the built-in lists (bid-inbox ?sources=1)
  * "Hide non-construction bids" (admins): preview "N bids will be hidden" (bid-inbox ?cleanup=1), then confirm ->
    the bids leave the inbox (dismissed, "Not construction (auto)") and their CRM leads are marked Lost with that reason.
    Nothing is deleted.
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_BIDFILTER.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'index.html')
MARK = '__GC_PATCH_BIDFILTER__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)
def once(s, old, new, label):
    n = s.count(old); assert n == 1, ('anchor count != 1', label, n)
    return s.replace(old, new)

# 1. the switch's wording, the explanation line, the cleanup box
src = once(src, "<b>All public bids (no keyword filter)</b></label>'\n      + '<div class=\"mini\">On: every bid on the boards comes in, except the \"leave out\" words below (supplies, software, vehicles, food, medical…). Off: only bids that mention one of the keywords.</div></div>'",
 "<b>All construction bids, any trade</b></label>'\n      + '<div class=\"mini\">On: any construction bid comes in, whatever the trade. Off: only bids that mention one of the keywords. <b>Only construction work becomes a lead. Equipment, vehicles, supplies and services are skipped.</b> Add your own words to either list below (the built-in words always apply).</div>'\n"
 "      + '<div class=\"row\" style=\"margin-top:6px\"><button type=\"button\" class=\"hb\" data-bw=\"hidepreview\">Hide non-construction bids</button><span class=\"mini\">hides the bids already in the Lead Inbox that are not construction (nothing is deleted) · <!-- " + MARK + " --></span></div><div id=\"bw-hide-out\" class=\"mini\" style=\"margin-top:4px\"></div></div>'",
 'switch')

# 2. the two buttons
src = once(src, "    if (a === 'savecfg') return busy(b, saveCfg());",
"""    if (a === 'hidepreview') {   /* patch BIDFILTER: preview, then confirm */
      var ho = body.querySelector('#bw-hide-out'); ho.textContent = 'Checking the bids already in the Lead Inbox…';
      return busy(b, api('GET', 'cleanup=1').then(function(r){
        var n = (r && r.count) || 0;
        ho.innerHTML = n ? '<b>' + n + ' bid' + (n === 1 ? '' : 's') + ' will be hidden</b> (marked closed / lost, "Not construction (auto)"; nothing is deleted)'
          + arr(r.items).slice(0, 15).map(function(x){ return '<div style="margin-top:2px">▫️ ' + esc(x.title) + (x.city ? ' · ' + esc(x.city) : '') + (x.why ? ' <span style="color:#6b7280">— ' + esc(x.why) + '</span>' : '') + '</div>'; }).join('')
          + (n > 15 ? '<div>… and ' + (n - 15) + ' more</div>' : '')
          + '<div style="margin-top:6px"><button type="button" class="hb pri" data-bw="hidego">Hide ' + n + ' bid' + (n === 1 ? '' : 's') + '</button></div>'
          : 'Nothing to hide: every bid in the Lead Inbox looks like construction work.';
      }, function(err){ ho.textContent = 'Could not check: ' + s(err && err.message); }));
    }
    if (a === 'hidego') {
      var ho2 = body.querySelector('#bw-hide-out');
      return busy(b, api('POST', 'cleanup=1', { confirm: true }).then(function(r){
        var ids = {}; arr(r && r.ids).forEach(function(i){ ids[i] = 1; });
        var at = nowIso(), why = (r && r.reason) || 'Not construction (auto)', n = 0;
        return setLeads(function(list){
          var ch = false;
          list.forEach(function(l, i){
            if (!l || !l.inboxId || !ids[l.inboxId] || l.stage === 'Lost' || l.stage === 'Won' || l.pid || l.jobId || l.converted) return;
            var x = Object.assign({}, l), from = x.stage || 'New Lead';
            x.stage = 'Lost'; x.stageChangedAt = at; x.lostReason = why; x.lostAt = at; x.stageHistory = arr(x.stageHistory).concat([{ from: from, to: 'Lost', at: at, by: 'Auto (not construction)' }]).slice(-60);
            list[i] = stamp(x); ch = true; n++;
          });
          return ch ? list : null;
        }).then(function(){
          S.items.forEach(function(x){ if (x && ids[x.id]) x.status = 'dismissed'; });
          ho2.innerHTML = '✅ ' + ((r && r.hidden) || 0) + ' bids hidden' + (n ? ' (' + n + ' lead' + (n === 1 ? '' : 's') + ' marked closed / lost)' : '') + '.';
          toast((r && r.hidden || 0) + ' non-construction bids hidden'); emit('dismissed'); later(function(){ pull(true); }, 1500);
        });
      }));
    }
    if (a === 'savecfg') return busy(b, saveCfg());""", 'buttons')
open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
