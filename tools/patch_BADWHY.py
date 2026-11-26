# BADWHY (owner 11/26: "when we comment bad lead for lsa we can type bad, didnt want to schedule appointment or whatever reason and
# marketing or office sees that when they qualify the lead"): every 👎 Bad lead button opens an inline box under it (quick picks + type
# your own — no pop-up); the reason is kept on the lead with who and when, and shown where the office and marketing qualify leads (the
# open lead's red "👎 Bad lead — <reason>" box with 📋 Copy reason, each 📞 Google calls row, a chip on the Leads list). The CRM block is
# tools/badwhy_tail.js. Usage: python3 tools/patch_BADWHY.py   (run from the repo root)
import os
here = os.path.dirname(os.path.abspath(__file__))
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'BADWHY' not in s
def sub(a, b):
    global s
    assert s.count(a) == 1, (a[:70], s.count(a)); s = s.replace(a, b)

# ── LSACHECK: the 📥 New lead card's 👎 (was two numbered prompts) ──
a0 = "  var pick = W.prompt('Why is it a bad lead? Type the number:"
a1 = "  pm(id, false, reason);\n}, true);"
assert s.count(a0) == 1 and s.count(a1) == 1
i0 = s.index(a0); i1 = s.index(a1, i0)
mid = s[i0:i1]
lines = mid.split('\n')
assert len(lines) == 4 and lines[1].startswith('  var n = parseInt(pick, 10), reason = REASONS[n - 1]') and lines[2].startswith('  if (admin()) {') and lines[3] == '', lines
adm = lines[2]; assert adm.count("lsaReason: s(reason) });") == 1
adm = adm.replace("lsaReason: s(reason) });", "lsaReason: s(reason), lsaReasonBy: me(), lsaReasonAt: new Date().toISOString() });")   # who and when
s = s[:i0] + ("  if (!W._gcBadWhy) return;   /* patch BADWHY: the reason inline under the button (quick picks + type it) — no pop-up */\n"
              "  W._gcBadWhy.open(b, { after: r }).then(function(reason){ if (reason == null) return;\n"
              + adm + "\n  pm(id, false, reason);\n  });\n}, true);") + s[i1 + len(a1):]
sub("saveLead(id, { lsaCheck: good ? 'pm_good' : 'pm_bad', lsaPmBy: me(), lsaPmAt: new Date().toISOString(), lsaReason: good ? '' : s(reason) });",
    "saveLead(id, { lsaCheck: good ? 'pm_good' : 'pm_bad', lsaPmBy: me(), lsaPmAt: new Date().toISOString(), lsaReason: good ? '' : s(reason), lsaReasonBy: good ? '' : me(), lsaReasonAt: good ? '' : new Date().toISOString() });   /* patch BADWHY: who and when */")
sub("label: '⚖️ Dispute ' + s(l.name || l.phone) + ' in Google Ads by ' + byS, note: 'Reason: ' + s(l.lsaReason || '—') + '. Google Ads",
    "label: '⚖️ Dispute ' + s(l.name || l.phone) + ' in Google Ads by ' + byS + (s(l.lsaReason) ? ' — \"' + s(l.lsaReason).slice(0, 60) + '\"' : ''), badReason: s(l.lsaReason), badBy: s(l.lsaReasonBy || l.lsaPmBy || me()), badAt: s(l.lsaReasonAt || l.lsaPmAt), note: 'Reason (paste into Google\\'s dispute form): ' + s(l.lsaReason || '—') + '. Google Ads")

# ── LSALEADS: 📞 Google calls / the lead's LSA bar 👎 Bad (was a prompt) ──
sub("function bad(id){\n  var why = W.prompt('Why is it a bad lead? (spam, wrong service, out of area, no answer ever …)', ''); if (why == null) return;\n",
    "function bad(id, btn){\n  if (!W._gcBadWhy) return;   /* patch BADWHY: the reason inline under the row (quick picks + type it) — no pop-up */\n  W._gcBadWhy.open(btn, { after: btn && btn.closest ? btn.closest('[data-lc-row]') : null }).then(function(why){ if (why == null) return;\n")
sub("    load(true);\n  });\n}\nD.addEventListener('click', function(e){\n  var t = e.target && e.target.closest ? e.target.closest('#gc-lc-btn,",
    "    var xb = byInbox(id); if (xb) { xb.check = 'bad'; xb.reason = s(why); xb.reasonAt = new Date().toISOString(); } paintList();   /* patch BADWHY */\n    load(true);\n  });\n  });\n}\nD.addEventListener('click', function(e){\n  var t = e.target && e.target.closest ? e.target.closest('#gc-lc-btn,")
sub("  if (t.hasAttribute('data-lc-bad')) { bad(t.getAttribute('data-lc-bad')); return; }",
    "  if (t.hasAttribute('data-lc-bad')) { bad(t.getAttribute('data-lc-bad'), t); return; }")
sub("""    + (rec ? '<div data-rec-id="' + esc(x.id) + '" style="margin-top:6px;padding:8px 10px;border-radius:9px;border:1px solid #c7d2fe;background:#f8fafc">' + rec + '</div>' : '') + intake + acts + '</div>';""",
    """    + (rec ? '<div data-rec-id="' + esc(x.id) + '" style="margin-top:6px;padding:8px 10px;border-radius:9px;border:1px solid #c7d2fe;background:#f8fafc">' + rec + '</div>' : '') + intake
    + (W._gcBadWhy && W._gcBadWhy.line ? W._gcBadWhy.line({ check: x.check, reason: x.reason, by: x.reasonBy || x.decidedBy, at: x.reasonAt }) : '') + acts + '</div>';   /* patch BADWHY: the reason, for the office / marketing */""")

# ── LSAFLOW2: the PM's 👎 Bad lead on his Google lead (was a prompt) ──
sub("  if (v === 'bad') { var why = W.prompt('Why is it not a real lead? (spam, selling something, wrong service, out of area …)', ''); if (why == null) return; b.disabled = true; mark(id, 'bad', s(why) || 'no reason given'); return; }",
    "  if (v === 'bad') { if (!W._gcBadWhy) return; W._gcBadWhy.open(b, { after: D.getElementById('gc-lsa-pm') }).then(function(why){ if (why == null) return; var b2 = D.querySelector('#gc-lsa-pm [data-pmb=\"bad\"]'); if (b2) b2.disabled = true; mark(id, 'bad', why); }); return; }   /* patch BADWHY: inline, no pop-up */")
sub("    if (verdict === 'bad') { saveLead(l.id, { lsaCheck: 'bad', lsaReason: s(reason), lsaDecidedAt: at, lsaDecidedBy: who, stage:",
    "    if (verdict === 'bad') { saveLead(l.id, { lsaCheck: 'bad', lsaReason: s(reason), lsaReasonBy: who, lsaReasonAt: at, lsaDecidedAt: at, lsaDecidedBy: who, stage:")

# ── LSATEXT sync: a BAD from a text / another computer carries who and when ──
sub("      else if (!d.good) Object.assign(patch, { lsaReason: s(d.reason), stage: 'Lost',",
    "      else if (!d.good) Object.assign(patch, { lsaReason: s(d.reason), lsaReasonBy: s(d.by), lsaReasonAt: s(d.at), stage: 'Lost',")

# ── the block ──
js = open(os.path.join(here, 'badwhy_tail.js'), encoding='utf-8').read(); assert '</script' not in js.lower()
anchor = "try { console.log('[GC] 📍 the PM\\'s 👍 / 👎 on his Google LSA lead (patch LSAFLOW2) — _gcLsaPm'); } catch (e) {}\n})(window);\n</script>\n"
sub(anchor, anchor + '<script id="gc-patch-badwhy">\n' + js + '</script>\n')
open(p, 'w', encoding='utf-8').write(s); print('BADWHY applied')
