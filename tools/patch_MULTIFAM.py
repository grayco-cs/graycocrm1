# MULTIFAM (owner 11/25, the job editor's Property list: "make sure multi family can be a choice"): Property = Residential / Multi-Family /
# Commercial / Industrial on every job form (new job, edit job, the job sheet, the lead → job form), and a lead's Multi-Family rides to its job.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'MULTIFAM' not in s
a = '["Residential","Residential"],["Commercial",'
n = s.count(a); assert n == 3, n
s = s.replace(a, '["Residential","Residential"],["Multi-Family","Multi-Family"]/*MULTIFAM*/,["Commercial",')
a = 'opts:["","Residential","Commercial","Industrial"]'; assert s.count(a) == 1
s = s.replace(a, 'opts:["","Residential","Multi-Family","Commercial","Industrial"]/*MULTIFAM*/')
a = "/^(Residential|Commercial|Industrial)$/.test(String(l.sector || ''))"; assert s.count(a) == 1
s = s.replace(a, "/^(Residential|Multi-Family|Commercial|Industrial)$/.test(String(l.sector || ''))   /* MULTIFAM */")
open(p, 'w', encoding='utf-8').write(s); print('MULTIFAM applied')
