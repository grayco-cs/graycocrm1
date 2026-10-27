#!/usr/bin/env python3
"""Idempotent patch LEADSCON: the Leads area becomes three tabs (Leads · Bids · Website).

 * React: tab bar -> Leads / Bids / Website; Launch Job / Bid Hub / Ads / Lead Gen tabs and their mount divs are gone;
   the Website tab carries the Facebook / Google lead-form note (Zapier -> website-intake, key only in Netlify).
 * Removes, entirely: the Bid Hub script, the Lead Gen script, the ag/lg blob iframes (urls + injector entries) and the
   Ads banner 2 s interval.  Data keys (lg_bids, gc_leadgen_lastscan ...) are NOT touched.
 * Lead Inbox sits under the tab bar (Bids only), Website strip on Website only, hub on Leads only (CSS in the tail).
 * Leads hub opens with no stuck filters.
 * Tail script (tools/leadscon_tail.js): company outreach list inside the Outreach view + window._gcOutreachImport,
   "Watched boards" card on Bids.
Usage: python3 tools/patch_leadscon.py [index.html]
"""
import sys, re, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = open(os.path.join(HERE, 'leadscon_tail.js'), encoding='utf-8').read().rstrip('\n')
MARK = '__GC_PATCH_LEADSCON__'
if MARK in src:
    print('already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

# ---------------------------------------------------------------- 1. React tab bar
once('xt=[{id:"launchjob_ext",l:"🚀 Launch Job",ext:!0},{id:"bidhub",l:"🏗 Bid Hub",admin:!0},{id:"adgen",l:"📣 Ads"},{id:"leadgen",l:"🔍 Lead Gen"},{id:"leads",l:"Lead Pipeline"},{id:"bidboard",l:"Bid Board ("+st.length+")"}];return e.jsxs("div",{children:[e.jsx("div",{style:{display:"flex",gap:0,marginBottom:14,borderBottom:"2px solid "+u.bdr},children:xt.filter(M=>!M.admin||B).map(M=>e.jsx("button",{onClick:',
     'xt=[{id:"leads",l:"Leads"},{id:"bidboard",l:"Bids ("+st.length+")"},{id:"website",l:"Website"}];return e.jsxs("div",{children:[e.jsx("div",{id:"gc-leads-tabs","data-tab":g,style:{display:"flex",gap:0,marginBottom:14,borderBottom:"2px solid "+u.bdr},children:xt.filter(M=>!M.admin||B).map(M=>e.jsx("button",{"data-gc-tab":M.id,onClick:',
     'tab bar')

# the Bid Hub / Lead Gen / Ads mount divs -> the Website tab note
a0 = src.index('B&&e.jsx("div",{style:{display:g==="bidhub"?"block":"none"')
a1_marker = 'children:"Open Ad Generator ↗"})]}),'
a1 = src.index(a1_marker, a0) + len(a1_marker)
old_block = src[a0:a1]
assert 'bh-mount' in old_block and 'lg-mount' in old_block and 'ag-mount' in old_block and len(old_block) < 2500, len(old_block)
assert src.count('B&&e.jsx("div",{style:{display:g==="bidhub"?"block":"none"') == 1
NOTE = ('g==="website"&&e.jsxs("div",{id:"gc-web-note",style:{border:"1px solid "+u.bdr,borderRadius:10,padding:"12px 16px",marginBottom:14,fontSize:13,lineHeight:1.6,color:u.tx2},children:['
        'e.jsx("b",{style:{fontSize:14},children:"📘 Facebook and Google lead forms"}),'
        'e.jsx("p",{style:{margin:"6px 0"},children:"Leads from a Facebook Lead Ad or a Google lead form reach the CRM through Zapier and the website-intake function, the same way the website forms do."}),'
        'e.jsxs("ol",{style:{margin:"0 0 6px 18px",padding:0},children:['
        'e.jsx("li",{children:"In Zapier, start a Zap: trigger Facebook Lead Ads (New Lead) or Google Ads (New Lead Form Entry)."}),'
        'e.jsx("li",{children:"Action: Webhooks by Zapier, POST (JSON) to /.netlify/functions/website-intake on the CRM address. Send name, phone, email, address and message."}),'
        'e.jsx("li",{children:"Add the header x-api-key. Its value is WEBSITE_ZAPIER_KEY, set in Netlify under Site settings, Environment variables. The key lives only there; never type it into the CRM or a form."}),'
        'e.jsx("li",{children:"New entries arrive as website leads on the Leads board and in the strip above. Embed code for the site forms is in the strip too."})]}),'
        'e.jsx("span",{style:{color:u.tx3,fontSize:12},children:"Full steps: docs/WEBSITE-TO-CRM.md"})]}),')
src = src[:a0] + NOTE + src[a1:]

# ---------------------------------------------------------------- 2. remove the Bid Hub and Lead Gen scripts
def drop_script(marker, label):
    global src
    m = src.index(marker)
    s0 = src.rfind('<script>', 0, m)
    assert 0 < m - s0 < 400, (label, m - s0)           # the opening tag is right above its header comment
    e0 = src.index('</script>', m) + len('</script>')
    assert 4000 < e0 - s0 < 120000, (label, e0 - s0)
    block = src[s0:e0]
    assert block.count('<script') == 1 and ('window._lg' in block or 'gcLeadGen' in block), label
    src = src[:s0] + '<!-- LEADSCON: ' + label + ' script removed (Leads is now Leads / Bids / Website) -->' + src[e0:]
assert src.count('// GrayCo Lead Generator — Full Rebuild (Vanilla JS)') == 1
drop_script('// GrayCo Lead Generator — Full Rebuild (Vanilla JS)', 'Bid Hub')
assert src.count('// GrayCo CRM — Lead Gen: Public Bid Monitor') == 1
drop_script('// GrayCo CRM — Lead Gen: Public Bid Monitor', 'Lead Gen')

# the ag / lg dark iframes: their blob URLs, the injector entries
for key in ('ag', 'lg'):
    pat = re.compile(r'(?m)^' + key + r':b64toURL\("[A-Za-z0-9+/=]+"\)(,?)\n')
    ms = pat.findall(src)
    assert len(pat.findall(src)) == 1, (key, len(ms))
    src = pat.sub('', src, count=1)
once('[["ag-mount",urls.ag],["lg-mount",urls.lg],["tc-mount",urls.tc],["claude-mount",urls.cl]]', '[["tc-mount",urls.tc],["claude-mount",urls.cl]]', 'inject list')
once('["ag-mount","lg-mount","tc-mount","claude-mount"].some(', '["tc-mount","claude-mount"].some(', 'sweep list')

# the Ads banner and its 2 s interval
b0 = src.index("/* the Leads tab's old \"📣 Ads\" sub-tab now says where its new home is */")
b1_marker = "}, 2000);\n"
b1 = src.index(b1_marker, b0) + len(b1_marker)
blk = src[b0:b1]
assert 'ag-mount' in blk and blk.count('setInterval') == 1 and len(blk) < 1500, len(blk)
src = src[:b0] + '/* LEADSCON: the old Ads sub-tab (and its banner timer) is gone; Ads live in Marketing -> Ads studio */\n' + src[b1:]
once('<button class="gmt-btn o" data-a="go-leads">🔍 Lead Gen / Bid Hub</button>', '<button class="gmt-btn o" data-a="go-leads">🔍 Leads / Bids</button>', 'marketing button')

# ---------------------------------------------------------------- 3. Lead Inbox / Website strip placement
once("""  for (var i = 0; i < bs.length; i++) { if (s(bs[i].textContent) === 'Lead Pipeline') { var bar = bs[i].parentElement; if (bar && /Bid Board/.test(bar.textContent)) return bar; } }
  return null;""",
     """  var tb = document.getElementById('gc-leads-tabs'); if (tb) return tb;   /* LEADSCON: Leads · Bids · Website */
  return null;""", 'leadsBar')
once("""  var bar = leadsBar(), cur = document.getElementById('gc-ldi');
  if (!bar) { if (cur && !cur.isConnected) cur = null; return; }
  if (cur && (cur.nextElementSibling === bar || (cur.nextElementSibling && cur.nextElementSibling.id === 'gc-web' && cur.nextElementSibling.nextElementSibling === bar))) return;""",
     """  var bar = leadsBar(), cur = document.getElementById('gc-ldi');
  if (!bar) { if (cur && !cur.isConnected) cur = null; return; }
  try { if (window._gcBidWatchCard) window._gcBidWatchCard(); } catch (e) {}   /* LEADSCON: the Watched boards card (Bids tab) */
  if (cur && cur.previousElementSibling === bar) return;   /* LEADSCON: the inbox sits right under the tab bar (shown on Bids only) */""", 'mountInbox head')
once("  bar.parentElement.insertBefore(cur, bar);\n  render(); readList('_setLeads')", "  bar.parentElement.insertBefore(cur, bar.nextSibling);\n  render(); readList('_setLeads')", 'mountInbox insert')

# the early HOT2b watcher: no hub is expected on Bids / Website, and there the classic page (the bid board's own header,
# its search and "+ New Bid Opportunity") must not be hidden by the hub-only CSS
once("    if (!on) { since = 0; return; }\n    if (document.getElementById('gc-leads-hub')) {\n      since = 0;",
     "    if (!on) { since = 0; return; }\n    var lt = document.getElementById('gc-leads-tabs'), other = !!lt && lt.getAttribute('data-tab') !== 'leads';   /* LEADSCON: Bids / Website have no hub */\n    if (other && !H.classList.contains('gcl-tabx')) { H.classList.add('gcl-tabx'); H.classList.add('gcl-classic-ok'); }\n    else if (!other && H.classList.contains('gcl-tabx')) { H.classList.remove('gcl-tabx'); if (!classicChosen() && !H.classList.contains('gcl-hub-failed')) H.classList.remove('gcl-classic-ok'); }\n    if (other) { since = 0; return; }\n    if (document.getElementById('gc-leads-hub')) {\n      since = 0;", 'hot2b early')
# the hub's "go back to the pipeline" click
once("""return s(x.textContent) === 'Lead Pipeline'; })[0]; if (b) b.click(); } catch (e) {}""", """return x.getAttribute('data-gc-tab') === 'leads' && !!x.closest('#gc-leads-tabs'); })[0]; if (b) b.click(); } catch (e) {}""", 'openLead tab click')

# ---------------------------------------------------------------- 4. no stuck filters
once("  var k = uiKey(), est = amEstimator(), U = lsGet(k, null);\n",
     "  var k = uiKey(), est = amEstimator(), U = lsGet(k, null);\n  if (U && !est) U = Object.assign({}, U, { who: '', src: '', type: '', stage: '', due: '', un: false, closed: false, preset: 'all', prio: '' });   /* LEADSCON: Leads always opens on ALL leads, no filter left over from last time */\n", 'loadUI')

# ---------------------------------------------------------------- 5. RSO hands its panel to the outreach list; tail script
once("  if (p && p.parentElement === h.parentElement) return p;      /* already beside the hub: leave it where it is */",
     "  if (p && p.parentElement === h.parentElement) { if (W._gcOutreachMount) W._gcOutreachMount(p); return p; }      /* already beside the hub: leave it where it is */", 'rso panel keep')
once("  h.parentElement.insertBefore(p, h); SIG = '';\n  return p;", "  h.parentElement.insertBefore(p, h); SIG = '';\n  if (W._gcOutreachMount) W._gcOutreachMount(p);   /* LEADSCON: the company outreach list sits just above */\n  return p;", 'rso panel new')
anchor = '<script id="gc-patch-pay2">'
assert src.count(anchor) == 1
src = src.replace(anchor, '<script id="gc-patch-leadscon">\n' + TAIL + '\n</script>\n' + anchor)

open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
