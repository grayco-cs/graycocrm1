# PITCH2 (owner 11/26, screenshot of the 7 AM "2 leads came in after hours" text: "These clearly aren't leads why do we keep getting them"):
# (1) two form-letter openers the filter did not know — the "local real estate investor … foreclosure … renovate it before listing / need a
# contractor" template mass-sent to contractors, and the cold-pitch opener "not sure who reads these … might not be a priority" — are held
# in 🧹 Sales & spam (Not spam → make lead still works) even though they name a property / a renovation. Added to the shared rules block
# (_lib/salesguard.js and the CRM page's verbatim copy). (2) the 👤 assign text said "It goes to false at 5 PM": the suggestion read
# s(state === 'held' && name), which is the word "false" when nothing is held.
lib_p = 'netlify/functions/_lib/salesguard.js'; idx_p = 'index.html'
lib = open(lib_p, encoding='utf-8').read(); idx = open(idx_p, encoding='utf-8').read()
assert 'PITCH2' not in lib and 'PITCH2' not in idx
A = "var SG_STRONG = [\n"
NEWV = """/* patch PITCH2 (owner 11/26): form letters mass-sent to contractors — held even when they name a property or a renovation */
var SG_TEMPLATE = [
  ['form letter: "local real estate investor … foreclosure / before listing it"', /\\b(i\\x27m|i\\u2019m|i\\s+am)\\s+(a|an)\\s+(local\\s+)?(real\\s+estate\\s+)?investor\\b[\\s\\S]{0,400}\\b(foreclos\\w*|before\\s+listing|list(ing)?\\s+it\\s+for\\s+sale|flip(ping)?|wholesal\\w*|bank[\\s-]owned|reo\\b)/i],
  ['cold-pitch opener: "not sure who reads these"', /\\bnot\\s+sure\\s+(who|if\\s+anyone)\\s+(reads|checks|sees|monitors)\\s+(these|this|this\\s+inbox|this\\s+form|the\\s+messages)\\b|\\bmight\\s+not\\s+(even\\s+)?be\\s+a\\s+priority\\b|\\bnot\\s+sure\\s+(if\\s+)?(this\\s+is|i\\x27m\\s+reaching)\\s+the\\s+right\\s+(person|place)\\b/i]
];
var SG_STRONG = [
"""
for s_ in (lib, idx): assert s_.count(A) == 1
lib = lib.replace(A, NEWV); idx = idx.replace(A, NEWV)
B = "  if (SG_ENV.test(t.replace(SG_ENV_NOT, ' '))) return '';   /* patch LEADBOTH: abatement / mold work is kept */\n"
C = B + "  for (var tq = 0; tq < SG_TEMPLATE.length; tq++) if (SG_TEMPLATE[tq][1].test(t)) return SG_TEMPLATE[tq][0] + ' (score 9)';   /* patch PITCH2 */\n"
for s_ in (lib, idx): assert s_.count(B) == 1
lib = lib.replace(B, C); idx = idx.replace(B, C)
open(lib_p, 'w', encoding='utf-8').write(lib); open(idx_p, 'w', encoding='utf-8').write(idx)
SA = 'netlify/functions/_lib/smsalert.js'; sa = open(SA, encoding='utf-8').read()
D = "    let sug = s(obj(l.hold).state === 'held' && obj(l.hold).name) || s(x.suggest);"
assert sa.count(D) == 1
sa = sa.replace(D, "    let sug = (obj(l.hold).state === 'held' ? s(obj(l.hold).name) : '') || s(x.suggest);   /* patch PITCH2: never the word \"false\" */\n    if (/^(false|true|null|undefined)$/i.test(sug)) sug = '';")
open(SA, 'w', encoding='utf-8').write(sa)
print('PITCH2 applied')
