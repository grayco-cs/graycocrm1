# TRADESPELL (owner 11/25, the trade tags on the bid site: "did we misspell concrete, fix that"): "Cocnrete and masonry" is a CRM sub's typed
# trade (not the code) — the bid site's trade buttons are GrayCo's list + the CRM subs' trades, so the typo became a button and a sub picked it.
# Common trade misspellings are now corrected where the list is built (the server), on the cards' trade tags and in ✎ Edit (so saving a
# profile stores the right spelling).
FIX = r"""[[/\bcocnrete\b/gi, 'concrete'], [/\bconcret\b/gi, 'concrete'], [/\bconrete\b/gi, 'concrete'], [/\bmasonary\b/gi, 'masonry'], [/\bmasonery\b/gi, 'masonry'], [/\bdrywal\b/gi, 'drywall'], [/\broffing\b/gi, 'roofing'], [/\bplumming\b/gi, 'plumbing'], [/\belectical\b/gi, 'electrical'], [/\bcarpentary\b/gi, 'carpentry'], [/\bpaintng\b/gi, 'painting'], [/\bflooing\b/gi, 'flooring']]"""
FN = "function tradeSpell(x){ let v = String(x == null ? '' : x); TRADE_TYPOS.forEach(function(p){ v = v.replace(p[0], function(m){ return m[0] === m[0].toUpperCase() ? p[1][0].toUpperCase() + p[1].slice(1) : p[1]; }); }); return v; }"
def sub(path, a, b):
    t = open(path, encoding='utf-8').read(); assert t.count(a) == 1, (path, a[:60], t.count(a)); open(path, 'w', encoding='utf-8').write(t.replace(a, b))
S = 'netlify/functions/subportal.js'
sub(S, "async function tradeList(){", "/* patch TRADESPELL */\nconst TRADE_TYPOS = " + FIX + ";\n" + FN + "\nasync function tradeList(){")
sub(S, "BASE_TRADES.concat(extra.join(',').split(/[,;\\/]/)).forEach(function(x){ x = s(x);", "BASE_TRADES.concat(extra.join(',').split(/[,;\\/]/)).forEach(function(x){ x = tradeSpell(s(x));")
A = 'subportal-app/src/App.jsx'
sub(A, "function TradeChips({ picked, onChange }) {", "/* patch TRADESPELL */\nconst TRADE_TYPOS = " + FIX + ";\n" + FN + "\nfunction TradeChips({ picked, onChange }) {")
sub(A, "    const all = Array.isArray(u.trades) ? u.trades.filter(Boolean) : [];", "    const all = Array.isArray(u.trades) ? u.trades.filter(Boolean).map(tradeSpell) : [];   /* TRADESPELL: saving fixes the spelling */")
t = open(A, encoding='utf-8').read()
a = "{u.trades.map(tr => <Badge key={tr} color={styles.blue}>{tr}</Badge>)}"
n = t.count(a); assert n == 3, n
t = t.replace(a, "{u.trades.map(tr => <Badge key={tr} color={styles.blue}>{tradeSpell(tr)}</Badge>)}")
open(A, 'w', encoding='utf-8').write(t)
print('TRADESPELL applied')
