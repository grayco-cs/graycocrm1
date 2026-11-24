# BIDSSAME (owner 11/24): "make sure when subs sign up on portal they know they can sign into the bid platform with same
# credentials at bids.grayco-cs.com". The portal and the bid site share one sign-in (the same account). Every sign-up step a sub
# sees on the portal now says so, with a link: the sign-up form, "Account created", "Check your e-mail" / "Confirmed", the
# waiting-for-approval page and the confirm-your-e-mail e-mail. (The "you are approved" e-mail in portal-access.js was edited
# by hand in the same release: the old "(… works with the same sign-in.)" aside is now its own sentence.)
def sub(p, a, b, n=1):
    t = open(p, encoding='utf-8').read(); assert t.count(a) == n, (p, a[:70], t.count(a)); open(p, 'w', encoding='utf-8').write(t.replace(a, b))
P = 'portal-app.js'
sub(P, "var DUPWHY = { es:", """/* patch BIDSSAME: one line, every sign-up step — the same e-mail and password open the bid site */
Object.assign(L.en, { bsSame: 'Your e-mail and password also sign you in to GrayCo\\u2019s bid site — jobs to bid, plans and your bids: ', bsSameAfter: 'Same sign-in for both.' });
Object.assign(L.es, { bsSame: 'Su correo y contraseña también le dan entrada al sitio de licitaciones de GrayCo — trabajos para licitar, planos y sus ofertas: ', bsSameAfter: 'La misma cuenta para los dos.' });
function bidsSame(){ return h('p', { class: 'bids-same', 'data-bids-same': '1', style: 'background:#FFF8E1;border:1px solid #F2D27A;border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.45' },
  ['🏗 ', t('bsSame'), h('a', { href: 'https://bids.grayco-cs.com', target: '_blank', rel: 'noopener', class: 'lnk', style: 'font-weight:700', text: 'bids.grayco-cs.com' }), '. ', t('bsSameAfter')]); }
var DUPWHY = { es:""")
sub(P, "  box.appendChild(h('p', { class: 'muted', text: t('suWhy') }));\n", "  box.appendChild(h('p', { class: 'muted', text: t('suWhy') }));\n  box.appendChild(bidsSame());   /* patch BIDSSAME */\n")
sub(P, "      h('p', { text: approved ? t('suDoneInv') : t('suDone') }), email ? h('div', { class: 'muted', text: email }) : null,",
       "      h('p', { text: approved ? t('suDoneInv') : t('suDone') }), email ? h('div', { class: 'muted', text: email }) : null, bidsSame(),   /* patch BIDSSAME */")
sub(P, "            h('div', { class: 'btns' }, [h('button', { type: 'button', class: 'btn gold', text: es ? 'Entrar' : 'Sign in', on: { click: function(){ location.reload(); } } })])])); return; }",
       "            bidsSame(), h('div', { class: 'btns' }, [h('button', { type: 'button', class: 'btn gold', text: es ? 'Entrar' : 'Sign in', on: { click: function(){ location.reload(); } } })])])); return; }   /* patch BIDSSAME */")
sub(P, "    h('div', { class: 'muted', text: email }), codeBox, h('div', { class: 'btns' }, [b]), note].filter(Boolean)));",
       "    h('div', { class: 'muted', text: email }), codeBox, h('div', { class: 'btns' }, [b]), note, bidsSame()].filter(Boolean)));   /* patch BIDSSAME */")
sub(P, "  box.appendChild(h('p', { class: 'muted', text: t('pdThen') }));\n", "  box.appendChild(h('p', { class: 'muted', text: t('pdThen') }));\n  box.appendChild(bidsSame());   /* patch BIDSSAME */\n")
S = 'netlify/functions/subportal.js'
sub(S, "'El enlace sirve una vez, por 24 horas. Si usted no se registró, ignore este correo.']",
       "'El enlace sirve una vez, por 24 horas. Si usted no se registró, ignore este correo.', 'Su correo y contraseña sirven en los dos sitios de GrayCo: el Portal (portal.grayco-cs.com) y el sitio de licitaciones (<a href=\"https://bids.grayco-cs.com\">bids.grayco-cs.com</a>) — la misma cuenta.']   /* patch BIDSSAME */")
sub(S, "Tap the button to confirm it is your e-mail.', 'The link works once, for 24 hours. If you did not sign up, ignore this e-mail — nothing happens.'],",
       "Tap the button to confirm it is your e-mail.', 'The link works once, for 24 hours. If you did not sign up, ignore this e-mail — nothing happens.', 'Your e-mail and password work on both GrayCo sites: the Portal (portal.grayco-cs.com) and the bid site (<a href=\"https://bids.grayco-cs.com\">bids.grayco-cs.com</a>) — one sign-in for both.'],   /* patch BIDSSAME */")
print('BIDSSAME: done')
