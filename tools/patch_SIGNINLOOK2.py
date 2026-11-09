#!/usr/bin/env python3
"""patch SIGNINLOOK2 (owner 11/9: "i dont like that newer sign in page … i had a cool page" · "not like tron future, just nice sleek
good looking, sharp animations and designs"). The company sign-in screen gets the old CRM login's look back: split screen —
left, the GrayCo logo, "Project Management built for GrayCo", what the CRM does as chips; right, a dark card "Sign in to your
account". Calm, quick animations: the panels fade and slide in, chips come in one after another, a slow soft light drifts on
the left, the inputs glow gold on focus, the button lifts on hover. Phones get the card only. prefers-reduced-motion = no
motion. Only the look changes: the same fields (ids), the same sign-in, Forgot password and messages."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '/*SIGNINLOOK2*/' in src: print('already patched'); sys.exit(0)
def rep(a, b):
    global src
    assert src.count(a) == 1, (src.count(a), a[:80]); src = src.replace(a, b)
CSS = (
"#gc-auth-gate{background:#0b1626!important;padding:0!important;align-items:stretch!important;justify-content:stretch!important}"
"#gc-auth-gate *{box-sizing:border-box}"
"#gc-auth-gate .gs-wrap{display:flex;width:100%;min-height:100%}"
"#gc-auth-gate .gs-left{flex:1.1;position:relative;overflow:hidden;padding:48px 56px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(150deg,#0f2440 0%,#0b1a30 60%,#0a1628 100%);animation:gsIn .7s cubic-bezier(.2,.7,.2,1) both}"
"#gc-auth-gate .gs-glow{position:absolute;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle,rgba(212,160,23,.16) 0%,rgba(37,99,235,.08) 45%,transparent 70%);top:-160px;left:-120px;animation:gsDrift 18s ease-in-out infinite alternate;pointer-events:none}"
"#gc-auth-gate .gs-line{position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,.5),transparent);animation:gsSweep 6s ease-in-out infinite;pointer-events:none}"
"#gc-auth-gate .gs-logo{width:230px!important;height:auto!important;max-width:60%!important;display:block;position:relative;object-fit:contain}"
"#gc-auth-gate .gs-h{position:relative;font-size:38px;line-height:1.15;font-weight:800;color:#fff;letter-spacing:-.02em;margin:0 0 16px}"
"#gc-auth-gate .gs-h span{color:#D4A017}"
"#gc-auth-gate .gs-p{position:relative;font-size:15px;color:rgba(255,255,255,.62);line-height:1.6;margin:0 0 28px;max-width:400px}"
"#gc-auth-gate .gs-chips{position:relative;display:flex;flex-wrap:wrap;gap:8px;max-width:520px}"
"#gc-auth-gate .gs-chip{padding:6px 14px;border-radius:20px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.75);font-size:12px;font-weight:500;opacity:0;animation:gsUp .5s ease both}"
"#gc-auth-gate .gs-foot{position:relative;display:flex;justify-content:space-between;align-items:flex-end;color:rgba(255,255,255,.38);font-size:11px;line-height:1.6}"
"#gc-auth-gate .gs-foot a{color:rgba(255,255,255,.55);text-decoration:none}"
"#gc-auth-gate .gs-right{flex:1;display:flex;align-items:center;justify-content:center;padding:32px 20px;background:radial-gradient(ellipse at 30% 40%,rgba(37,99,235,.07) 0%,transparent 60%),#0f1d32}"
"#gc-auth-gate .gs-col{width:100%;max-width:400px;animation:gsUp .6s .12s cubic-bezier(.2,.7,.2,1) both}"
"#gc-auth-gate .gs-title{text-align:center;margin:0 0 26px}"
"#gc-auth-gate .gs-title h2{font-size:23px;font-weight:700;color:#fff;margin:0 0 6px;letter-spacing:-.01em}"
"#gc-auth-gate .gs-title p{font-size:13px;color:rgba(255,255,255,.45);margin:0}"
"#gc-auth-gate .gs-mlogo{display:none;height:44px;margin:0 auto 18px}"
"#gc-auth-gate form{background:#172a45!important;border:1px solid rgba(255,255,255,.07);border-radius:16px!important;padding:30px 28px!important;max-width:none!important;box-shadow:0 24px 64px rgba(0,0,0,.42)!important}"
"#gc-auth-gate form>div:first-child,#gc-auth-gate form>div:nth-child(2){display:none}"
"#gc-auth-gate label{color:rgba(255,255,255,.6)!important;text-transform:uppercase;letter-spacing:.06em;font-size:11px!important}"
"#gc-auth-gate input{background:#0f1d32!important;border:1px solid rgba(255,255,255,.12)!important;color:#fff!important;border-radius:10px!important;padding:12px 14px!important;transition:border-color .2s,box-shadow .2s}"
"#gc-auth-gate input:focus{outline:none;border-color:#D4A017!important;box-shadow:0 0 0 3px rgba(212,160,23,.22)}"
"#gc-auth-gate input:-webkit-autofill{-webkit-text-fill-color:#fff;-webkit-box-shadow:0 0 0 40px #0f1d32 inset}"
"#gc-auth-submit{background:linear-gradient(135deg,#D4A017,#c08e0e)!important;color:#0f1d32!important;border-radius:10px!important;padding:13px!important;font-weight:800!important;letter-spacing:.01em;transition:transform .15s,box-shadow .2s,filter .2s;box-shadow:0 6px 18px rgba(212,160,23,.25)}"
"#gc-auth-submit:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(212,160,23,.35);filter:brightness(1.05)}"
"#gc-auth-submit:active{transform:translateY(0)}"
"#gc-auth-gate #gc-auth-forgot{color:#e3b53a!important}"
"#gc-auth-gate #gc-auth-msg{color:#fca5a5}"
"#gc-auth-gate form>div:last-child{color:rgba(255,255,255,.4)!important}"
"@keyframes gsIn{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}"
"@keyframes gsUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}"
"@keyframes gsDrift{from{transform:translate(0,0)}to{transform:translate(180px,220px)}}"
"@keyframes gsSweep{0%,100%{opacity:.25}50%{opacity:.9}}"
"@media (max-width:900px){#gc-auth-gate .gs-left{display:none}#gc-auth-gate .gs-mlogo{display:block}}"
"@media (prefers-reduced-motion:reduce){#gc-auth-gate *{animation:none!important;transition:none!important;opacity:1!important}}")
CHIPS = ["Estimates", "Jobs & schedule", "Subs & bids", "Customer portal", "E-sign papers", "Invoices", "Field app", "Photos", "Change orders", "Punch lists", "Daily logs", "Leads"]
rep("""    gate.appendChild(card);
    /* keep keys typed here away from the app's own shortcuts */""",
"""    /*SIGNINLOOK2*/ try {
      var st2 = document.createElement('style'); st2.textContent = """ + repr(CSS) + """; gate.appendChild(st2);
      var wrap = el('div'); wrap.className = 'gs-wrap';
      var left = el('div'); left.className = 'gs-left';
      left.innerHTML = '<div class="gs-glow"></div><div class="gs-line"></div><img class="gs-logo" src="/portal-logo.png" alt="GrayCo Construction Services">' +
        '<div><h1 class="gs-h">Project management<br>built for <span>GrayCo</span></h1><p class="gs-p">Estimates, jobs, subs, money and the field — all in one place, the way we work.</p><div class="gs-chips">' +
        """ + repr(CHIPS) + """.map(function(c, i){ return '<span class="gs-chip" style="animation-delay:' + (0.35 + i * 0.05).toFixed(2) + 's">' + c + '</span>'; }).join('') + '</div></div>' +
        '<div class="gs-foot"><div>Bartlett, Tennessee<br>Commercial · Residential · Restoration</div><div style="text-align:right"><a href="https://grayco-cs.com" target="_blank" rel="noopener">grayco-cs.com</a><br>© ' + new Date().getFullYear() + ' GrayCo Construction Services</div></div>';
      var right = el('div'); right.className = 'gs-right';
      var col = el('div'); col.className = 'gs-col';
      col.innerHTML = '<img class="gs-mlogo" src="/portal-logo.png" alt="GrayCo"><div class="gs-title"><h2>Sign in to your account</h2><p>Staff only — use your own work email</p></div>';
      col.appendChild(card); right.appendChild(col); wrap.appendChild(left); wrap.appendChild(right); gate.appendChild(wrap);
    } catch (e) { gate.appendChild(card); }
    /* keep keys typed here away from the app's own shortcuts */""")
open(P, 'w', encoding='utf-8').write(src); print('patched')
