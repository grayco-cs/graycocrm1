# PAYDD (owner 11/26: "we do direct deposit also, we do not accept credit cards yet"): every "How to pay" — the portal's Payments tab and
# final-invoice box, the invoice / past-due e-mails — also says direct deposit (bank transfer: the bank details come from the office by
# phone or e-mail, never printed on the portal or in an e-mail) and "No credit cards yet."
import re
def sub(p, a, b, n=1):
    s = open(p, encoding='utf-8').read()
    assert s.count(a) == n, (p, a[:60], s.count(a)); s = s.replace(a, b); open(p, 'w', encoding='utf-8').write(s)
DD_H = ", or ', h('b', { text: 'direct deposit' }), ' (call ' + OFFICE + ' or e-mail billing@grayco-cs.com for our bank details). We do not take credit cards yet."
sub('portal.html', """' — hand it to your Project Manager' + (V.pm && V.pm.name ? ' (' + V.pm.name + ')' : '') + '. Every payment shows on your ', h('b', { text: 'final invoice' }), '.'])])""",
    """' — hand it to your Project Manager' + (V.pm && V.pm.name ? ' (' + V.pm.name + ')' : '') + '""" + DD_H + """ Every payment shows on your ', h('b', { text: 'final invoice' }), '.'])])   /* patch PAYDD */""")
sub('portal.html', """' — hand it to your Project Manager' + (V.pm && V.pm.name ? ' (' + V.pm.name + ')' : '') + '.'])]));""",
    """' — hand it to your Project Manager' + (V.pm && V.pm.name ? ' (' + V.pm.name + ')' : '') + '""" + DD_H + """'])]));   /* patch PAYDD */""")
DD_M = " Or <b>direct deposit</b> — call (901) 585-0944 or e-mail billing@grayco-cs.com for our bank details. Every way to pay (and card payments, once GrayCo takes them) is on the Payments tab of your portal."
sub('netlify/functions/_lib/auto-ar.js', "The invoice is attached and is always in your portal.</p>'", "The invoice is attached and is always in your portal." + DD_M + "</p>'")
sub('netlify/functions/portal.js', "' + esc(pmName) + '. Every payment shows on your final invoice.</p>'", "' + esc(pmName) + '." + DD_M + " Every payment shows on your final invoice.</p>'")
sub('netlify/functions/portal.js', "' + esc(doc.pm || 'your Project Manager') + '.</p>'", "' + esc(doc.pm || 'your Project Manager') + '." + DD_M + "</p>'")
print('PAYDD applied')
