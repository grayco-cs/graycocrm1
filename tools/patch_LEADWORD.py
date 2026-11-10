"""patch LEADWORD (owner 11/10: "no lead in this typo — lead like leeeeed"): the papers' keyword trigger must not read a SALES lead
("good lead", "bad lead", "Google LSA lead", "new lead", "no answer on the lead", "leads") as lead paint — only lead paint words
(lead paint, lead-based, lead hazard / test / found / abatement / safe, RRP, pre-1978) and "lead" on its own when it is not a sales lead."""
import sys
P = 'index.html'; src = open(P).read()
if '/*LEADWORD*/' in src: print('already patched'); sys.exit(0)
a = r"has(/\blead\b(?![ -]?(time|gen|source|in\b|s?\s+(to|from|for)))|lead[- ]based|lead paint|\brrp\b/)"
b = r"/*LEADWORD*/ has(/(?<!\b(good|bad|new|hot|warm|cold|lsa|google|sales|qualified|real|fake|spam|web|website|referral|partner|facebook|angi|homeadvisor|thumbtack|this|that|the|a|no|our|your|his|her|their|my|next|old|dead|open|closed|lost|won)\s)\blead\b(?![ -]?(time|gen|source|in\b|s?\s+(to|from|for|is|was|came|said|says|called|wants|asked|needs|from)))|lead[- ]based|lead paint|lead[- ](hazard|test|found|abatement|safe|dust)|\brrp\b|pre[- ]?1978/)"
assert src.count(a) == 1
src = src.replace(a, b); open(P, 'w').write(src); print('ok')
