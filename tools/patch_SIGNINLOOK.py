#!/usr/bin/env python3
"""Idempotent patch SIGNINLOOK (owner 10/30: "That original sign in screen has been gone for a while can you bring it
back instead of the one we have now"): the company sign-in gate (the secure Supabase sign-in, patch PWRESET's
forgot / set-password screens) gets the ORIGINAL look back -- the blue brand panel with the gold GrayCo logo (the
original's own artwork, now without the white tile and about twice as big), "Project Management Built for GrayCo --
by GrayCo", the feature chips, and the dark "Sign in to your account" card with the e-mail / password icons, the
show-password eye, Remember me, Forgot password?, the big blue Sign In button and the contact lines.

Only the look changes. Every id (gc-auth-gate / -email / -password / -submit / -msg / -forgot, gc-pw-screen, gc-forgot-*,
gc-pw-*), every message, the focus and the last-e-mail prefill stay. New: Remember me (gc_auth_remember, default on)
decides whether gc_auth_last_email is kept after a sign-in. The old React login is NOT revived.
Phones / tablets (<= 860 px): stacked, a compact logo + title header over the card, 16 px inputs (no iOS zoom)."""
import sys, os, base64, json
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch SIGNINLOOK */'
if MARK in t: print('SIGNINLOOK: already patched'); sys.exit(0)
here = os.path.dirname(os.path.abspath(__file__))
LOGO = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(here, 'signin_logo_gold.png'), 'rb').read()).decode()

def once(old, new):
    global t
    c = t.count(old); assert c == 1, ('SIGNINLOOK anchor', c, old[:90]); t = t.replace(old, new)
def every(old, new, want):
    global t
    c = t.count(old); assert c == want, ('SIGNINLOOK count', c, want, old[:90]); t = t.replace(old, new)

CSS = r"""
.gca-root{position:fixed;inset:0;z-index:2147483647;background:#0a1628;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;box-sizing:border-box;color-scheme:dark;text-align:left}
.gca-root *,.gca-root *:before,.gca-root *:after{box-sizing:border-box}
.gca-wrap{display:flex;min-height:100%;width:100%}
.gca-brand{flex:0 0 480px;background:linear-gradient(160deg,#0f2440 0%,#1a3a65 40%,#2563eb 100%);display:flex;flex-direction:column;justify-content:space-between;padding:40px 48px 28px;position:relative;overflow:hidden}
.gca-stripes{position:absolute;inset:0;opacity:.06;background-image:repeating-linear-gradient(45deg,transparent,transparent 35px,rgba(255,255,255,.1) 35px,rgba(255,255,255,.1) 36px);pointer-events:none}
.gca-glow1{position:absolute;right:-80px;top:-80px;width:300px;height:300px;border-radius:50%;background:rgba(37,99,235,.15);filter:blur(60px);pointer-events:none}
.gca-glow2{position:absolute;left:-40px;bottom:-40px;width:200px;height:200px;border-radius:50%;background:rgba(59,130,246,.1);filter:blur(40px);pointer-events:none}
.gca-top{position:relative;z-index:1}
.gca-logo{display:block;width:340px;max-width:100%;height:auto;margin:0 0 30px;filter:drop-shadow(0 8px 32px rgba(0,0,0,.3))}
.gca-h1{font-size:36px;font-weight:800;color:#fff;line-height:1.2;margin:0 0 14px;letter-spacing:-.02em}
.gca-h1 span{color:rgba(255,255,255,.5);font-size:24px}
.gca-lead{font-size:15px;color:rgba(255,255,255,.6);line-height:1.6;margin:0 0 28px;max-width:360px}
.gca-chips{display:flex;flex-wrap:wrap;gap:8px}
.gca-chip{padding:6px 14px;border-radius:20px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.7);font-size:12px;font-weight:500;white-space:nowrap}
.gca-bfoot{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-end;gap:8px;white-space:nowrap;margin-top:28px;font-size:11px;line-height:1.45;color:rgba(255,255,255,.35)}
.gca-bfoot a{color:rgba(255,255,255,.5);text-decoration:none}
.gca-copy{color:rgba(255,255,255,.3);font-size:10px;margin-top:2px}
.gca-main{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;background:#0f1d32;position:relative;padding:32px 24px}
.gca-main:before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 30% 50%,rgba(37,99,235,.05) 0%,transparent 60%);pointer-events:none}
.gca-box{width:400px;max-width:100%;position:relative;z-index:1}
.gca-head{text-align:center;margin-bottom:32px}
.gca-head h2{font-size:22px;font-weight:700;color:#fff;margin:0 0 6px;line-height:1.3}
.gca-head p{font-size:13px;color:rgba(255,255,255,.4);margin:0;line-height:1.5}
.gca-card{background:#172a45;border-radius:16px;padding:32px 28px;border:1px solid rgba(255,255,255,.06);box-shadow:0 24px 64px rgba(0,0,0,.4);margin:0}
.gca-f{margin-bottom:18px}
.gca-lbl{display:block;font-size:12px;font-weight:600;color:rgba(255,255,255,.6);margin:0 0 6px;text-transform:uppercase;letter-spacing:.05em}
.gca-in{position:relative}
.gca-ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,.3);font-size:16px;line-height:1;pointer-events:none}
.gca-root .gca-in input{display:block;width:100%;padding:12px 12px 12px 38px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;font-size:14px;font-family:inherit;outline:none;margin:0;transition:border-color .2s,box-shadow .2s;-webkit-appearance:none;appearance:none}
.gca-root .gca-in input.gca-haseye{padding-right:46px}
.gca-root .gca-in input:focus{border-color:rgba(37,99,235,.6);box-shadow:0 0 0 3px rgba(37,99,235,.18)}
.gca-root .gca-in input::placeholder{color:rgba(255,255,255,.3);opacity:1}
.gca-root .gca-in input:disabled{opacity:.6}
.gca-root .gca-in input:-webkit-autofill{-webkit-box-shadow:0 0 0 1000px #1d3150 inset;-webkit-text-fill-color:#fff;caret-color:#fff}
.gca-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:rgba(255,255,255,.35);font-size:14px;line-height:1;padding:7px 8px;border-radius:6px;font-family:inherit}
.gca-eye:hover{color:rgba(255,255,255,.7)}
.gca-row{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:22px;flex-wrap:wrap}
.gca-rem{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:rgba(255,255,255,.5);margin:0;font-weight:400;text-transform:none;letter-spacing:0}
.gca-root .gca-rem input{-webkit-appearance:checkbox;appearance:auto;accent-color:#2563eb;width:15px;height:15px;margin:0;padding:0;cursor:pointer;flex:none}
.gca-link{background:none;border:none;color:#3b82f6;font-size:12px;cursor:pointer;padding:4px 0;font-family:inherit;font-weight:500}
.gca-link:hover{color:#60a5fa;text-decoration:underline}
.gca-back{display:block;margin:16px auto 0;font-size:13px}
.gca-msg{font-size:13px;line-height:1.45;margin:0 0 16px;padding:10px 14px;border-radius:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#fca5a5}
.gca-msg:empty{display:none}
.gca-msg.gca-ok{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.22)}
.gca-btn{display:block;width:100%;padding:13px 0;border-radius:10px;border:none;background:linear-gradient(135deg,#2563eb 0%,#3b82f6 100%);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(37,99,235,.4);letter-spacing:.02em;transition:transform .1s,box-shadow .1s;margin:0}
.gca-btn:active{transform:scale(.98)}
.gca-btn:disabled{opacity:.6;cursor:default}
.gca-pwcard .gca-msg{margin:16px 0 0}
.gca-foot{text-align:center;margin-top:24px}
.gca-staff{font-size:11px;color:rgba(255,255,255,.4);line-height:1.5;margin:0 0 12px}
.gca-need{font-size:12px;color:rgba(255,255,255,.25);margin:0}
.gca-contact{font-size:11px;color:rgba(255,255,255,.15);margin:8px 0 0}
.gca-contact a{color:rgba(255,255,255,.3);text-decoration:none}
.gca-contact a:hover{color:rgba(255,255,255,.6)}
.gca-contact span{margin:0 8px}
.gca-sync{margin-top:20px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;color:rgba(255,255,255,.4)}
.gca-dot{width:8px;height:8px;border-radius:4px;background:#22c55e}
@media (max-width:1100px) and (min-width:861px){.gca-brand{flex-basis:420px;padding:36px 36px 24px}.gca-logo{width:300px}.gca-h1{font-size:32px}}
@media (max-height:760px) and (min-width:861px){.gca-logo{width:280px;margin-bottom:20px}.gca-lead{margin-bottom:20px}}
@media (max-width:860px){
.gca-wrap{flex-direction:column}
.gca-brand{flex:none;padding:22px 20px 20px;align-items:center;text-align:center}
.gca-logo{width:min(230px,64vw);margin:0 auto 12px}
.gca-h1{font-size:20px;line-height:1.3;margin:0}
.gca-h1 br{display:none}
.gca-h1 span{font-size:17px}
.gca-lead,.gca-chips,.gca-bfoot,.gca-glow2{display:none}
.gca-main{flex:1;align-items:flex-start;padding:24px 16px 32px}
.gca-head{margin-bottom:18px}
.gca-head h2{font-size:20px}
.gca-card{padding:22px 18px}
.gca-root .gca-in input{font-size:16px}
}
@media (pointer:coarse){.gca-root .gca-in input{font-size:16px}}
"""

JS_SHELL = r"""/* patch SIGNINLOOK: the ORIGINAL sign-in look (blue brand panel + dark card), shared by the sign-in and the password screens */
var GCA_LOGO = '__LOGO__';
var GCA_CSS = __CSS__;
var GCA_CHIPS = ['Estimating', 'Project Tracking', 'Sub Compliance', 'CompanyCam Sync', 'Invoicing', 'Scope Generator', 'Products Database', 'Price Sheets', 'Daily Logs', 'Crew Board', 'Plans & Docs', 'CC Transactions', 'Change Orders', 'Punch Lists'];
function gcaShell(id, label){
  var root = el('div'); root.id = id; root.className = 'gca-root'; root.setAttribute('data-gc-keep', '1');
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', label);
  var st = document.createElement('style'); st.textContent = GCA_CSS; root.appendChild(st);
  var wrap = el('div'); wrap.className = 'gca-wrap'; root.appendChild(wrap);
  var brand = el('div'); brand.className = 'gca-brand'; wrap.appendChild(brand);
  ['gca-stripes', 'gca-glow1', 'gca-glow2'].forEach(function(c){ var d = el('div'); d.className = c; d.setAttribute('aria-hidden', 'true'); brand.appendChild(d); });
  var top = el('div'); top.className = 'gca-top'; brand.appendChild(top);
  var img = document.createElement('img'); img.className = 'gca-logo'; img.src = GCA_LOGO; img.alt = 'GrayCo Construction Services'; img.draggable = false; top.appendChild(img);
  var h1 = el('h1'); h1.className = 'gca-h1';
  h1.appendChild(document.createTextNode('Project Management ')); h1.appendChild(el('br'));
  h1.appendChild(document.createTextNode('Built for GrayCo — ')); h1.appendChild(el('br'));
  h1.appendChild(el('span', '', 'by GrayCo')); top.appendChild(h1);
  var lead = el('p', '', 'Estimates, scheduling, subs, financials, and field ops — all in one place. No fluff, just tools that work the way you do.'); lead.className = 'gca-lead'; top.appendChild(lead);
  var chips = el('div'); chips.className = 'gca-chips'; chips.setAttribute('aria-hidden', 'true');
  GCA_CHIPS.forEach(function(c){ var s = el('span', '', c); s.className = 'gca-chip'; chips.appendChild(s); }); top.appendChild(chips);
  var bf = el('div'); bf.className = 'gca-bfoot'; brand.appendChild(bf);
  var bl = el('div'); bl.appendChild(el('div', '', 'Bartlett, Tennessee')); bl.appendChild(el('div', '', 'Commercial · Residential · Restoration')); bf.appendChild(bl);
  var br = el('div', 'text-align:right'); var site = el('a', '', 'grayco-cs.com'); site.href = 'https://grayco-cs.com'; site.target = '_blank'; site.rel = 'noreferrer'; br.appendChild(site);
  var cp = el('div', '', '© ' + new Date().getFullYear() + ' GrayCo Construction Services'); cp.className = 'gca-copy'; br.appendChild(cp); bf.appendChild(br);
  var main = el('div'); main.className = 'gca-main'; wrap.appendChild(main);
  var box = el('div'); box.className = 'gca-box'; main.appendChild(box);
  return { root: root, box: box };
}
function gcaHead(box, title, sub){
  var hd = el('div'); hd.className = 'gca-head';
  hd.appendChild(el('h2', '', title));
  var p = el('p', '', sub || ''); hd.appendChild(p); box.appendChild(hd); return p;
}
/* one input with its icon (and the eye for a password) */
function gcaInput(card, label, type, id, ac, icon, ph){
  var f = el('div'); f.className = 'gca-f';
  var l = el('label', '', label); l.className = 'gca-lbl'; l.htmlFor = id; f.appendChild(l);
  var w = el('div'); w.className = 'gca-in'; f.appendChild(w);
  var ic = el('span', '', icon); ic.className = 'gca-ic'; ic.setAttribute('aria-hidden', 'true'); w.appendChild(ic);
  var i = el('input'); i.type = type; i.id = id; i.name = id; i.autocomplete = ac; if (ph) i.placeholder = ph;
  if (type === 'email') { i.autocapitalize = 'off'; i.spellcheck = false; i.setAttribute('inputmode', 'email'); }
  w.appendChild(i);
  if (type === 'password') {
    i.className = 'gca-haseye';
    var eye = el('button', '', '👁'); eye.type = 'button'; eye.className = 'gca-eye'; eye.id = id + '-show';
    eye.setAttribute('aria-label', 'Show password'); eye.setAttribute('aria-pressed', 'false'); eye.title = 'Show password';
    eye.onclick = function(){ var on = i.type === 'password'; i.type = on ? 'text' : 'password'; eye.textContent = on ? '🙈' : '👁';
      eye.setAttribute('aria-pressed', on ? 'true' : 'false'); eye.setAttribute('aria-label', on ? 'Hide password' : 'Show password'); eye.title = on ? 'Hide password' : 'Show password';
      try { i.focus(); var n = i.value.length; i.setSelectionRange(n, n); } catch (e) {} };
    w.appendChild(eye);
  }
  card.appendChild(f); return i;
}
function gcaHidePw(scope){ try { (scope || document).querySelectorAll('.gca-haseye').forEach(function(i){ i.type = 'password'; var b = document.getElementById(i.id + '-show'); if (b) { b.textContent = '\ud83d\udc41'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Show password'); b.title = 'Show password'; } }); } catch (e) {} }
/* Remember me: on (the default) keeps the last e-mail on this computer for the next sign-in; off forgets it */
function gcaRemember(){ try { return localStorage.getItem('gc_auth_remember') !== '0'; } catch (e) { return true; } }
function keepEmail(email){ try { if (gcaRemember()) localStorage.setItem('gc_auth_last_email', email); else localStorage.removeItem('gc_auth_last_email'); } catch (e) {} }
function showGate(msg){"""

GATE_OLD_START = """  if (!gate) {
    gate = el('div', 'position:fixed;inset:0;z-index:2147483647;background:linear-gradient(160deg,#0a1628 0%,#0f2440 55%,#1a3a65 100%);'"""
GATE_OLD_END = """    gate.appendChild(card);
    /* keep keys typed here away from the app's own shortcuts */
    gate.addEventListener('keydown', function(ev){ ev.stopPropagation(); });
  }
"""
GATE_NEW = r"""  if (!gate) {   /* patch SIGNINLOOK */
    var sh = gcaShell('gc-auth-gate', 'GrayCo company sign-in'); gate = sh.root;
    gcaHead(sh.box, 'Sign in to your account', 'Enter your credentials to access the project hub');
    var card = el('form'); card.className = 'gca-card'; sh.box.appendChild(card);
    card.setAttribute('autocomplete', 'on');
    var em = gcaInput(card, 'Email Address', 'email', 'gc-auth-email', 'username', '✉', 'you@grayco-cs.com'); em.required = true;
    var pw = gcaInput(card, 'Password', 'password', 'gc-auth-password', 'current-password', '🔒', '••••••••'); pw.required = true;
    var row = el('div'); row.className = 'gca-row'; card.appendChild(row);
    var rl = el('label'); rl.className = 'gca-rem'; rl.htmlFor = 'gc-auth-remember';
    var rc = el('input'); rc.type = 'checkbox'; rc.id = 'gc-auth-remember'; rc.checked = gcaRemember();
    rc.onchange = function(){ try { localStorage.setItem('gc_auth_remember', rc.checked ? '1' : '0'); } catch (e) {} };
    rl.appendChild(rc); rl.appendChild(document.createTextNode('Remember me')); row.appendChild(rl);
    /* patch PWRESET: a working "Forgot password?" — an e-mailed one-time link */
    var fg = el('button', '', 'Forgot password?'); fg.className = 'gca-link';
    fg.type = 'button'; fg.id = 'gc-auth-forgot';
    fg.onclick = function(){ showForgot(em.value); };
    row.appendChild(fg);
    gateMsg = el('div'); gateMsg.id = 'gc-auth-msg'; gateMsg.className = 'gca-msg';
    gateMsg.setAttribute('role', 'status');
    card.appendChild(gateMsg);
    var btn = el('button', '', 'Sign In'); btn.className = 'gca-btn';
    btn.type = 'submit'; btn.id = 'gc-auth-submit';
    card.appendChild(btn);
    var ft = el('div'); ft.className = 'gca-foot'; sh.box.appendChild(ft);
    var staff = el('p', '', 'For GrayCo staff only. Use your own work email. Forgot your password? Click Forgot password? for an e-mailed link, or ask Wesley or Nick (💎 → Team access).'); staff.className = 'gca-staff'; ft.appendChild(staff);
    var need = el('p', '', 'Need access? Contact your administrator'); need.className = 'gca-need'; ft.appendChild(need);
    var ct = el('p'); ct.className = 'gca-contact';
    var tel = el('a', '', '901-585-0944'); tel.href = 'tel:9015850944'; ct.appendChild(tel);
    ct.appendChild(el('span', '', '·'));
    var ml = el('a', '', 'info@grayco-cs.com'); ml.href = 'mailto:info@grayco-cs.com'; ct.appendChild(ml);
    ft.appendChild(ct);
    var sy = el('div'); sy.className = 'gca-sync'; sy.setAttribute('aria-hidden', 'true');   /* decorative, like the original — no network check */
    var dot = el('span'); dot.className = 'gca-dot'; sy.appendChild(dot); sy.appendChild(el('span', '', '☁️ Cloud Sync Active')); ft.appendChild(sy);
    card.addEventListener('submit', function(ev){
      ev.preventDefault();
      signIn(em.value, pw.value).then(function(ok){ if (ok) { pw.value = ''; gcaHidePw(gate); } });
    });
    /* keep keys typed here away from the app's own shortcuts */
    gate.addEventListener('keydown', function(ev){ ev.stopPropagation(); });
  }
  try { var rc2 = document.getElementById('gc-auth-remember'); if (rc2) rc2.checked = gcaRemember(); } catch (e) {}
"""

# 1. the sign-in gate
once("function showGate(msg){\n  if (pwBox && document.documentElement.contains(pwBox)) return;",
     JS_SHELL.replace('__LOGO__', LOGO).replace('__CSS__', json.dumps(CSS.strip())) + "\n  if (pwBox && document.documentElement.contains(pwBox)) return;")
a = t.count(GATE_OLD_START); b = t.count(GATE_OLD_END); assert a == 1 and b == 1, ('SIGNINLOOK gate block', a, b)
i0 = t.index(GATE_OLD_START); i1 = t.index(GATE_OLD_END, i0) + len(GATE_OLD_END)
assert i1 - i0 < 6000, 'SIGNINLOOK gate block too long'
t = t[:i0] + GATE_NEW + t[i1:]
once("  if (gateMsg) { gateMsg.style.color = '#b91c1c'; gateMsg.textContent = msg || ''; }",
     "  if (gateMsg) { gateMsg.className = 'gca-msg'; gateMsg.style.color = '#fca5a5'; gateMsg.textContent = msg || ''; }")
once("function say(t, ok){ if (gateMsg) { gateMsg.style.color = ok ? '#166534' : '#b91c1c'; gateMsg.textContent = t; } }",
     "function say(t, ok){ if (gateMsg) { gateMsg.className = ok ? 'gca-msg gca-ok' : 'gca-msg'; gateMsg.style.color = ok ? '#86efac' : '#fca5a5'; gateMsg.textContent = t; } }")
# Remember me decides whether the e-mail is kept
every("try { localStorage.setItem('gc_auth_last_email', email); } catch (e) {}", "keepEmail(email);", 2)

# 2. the password screens (forgot / set / choose your own) wear the same look
P_OLD_START = "function pwScreen(title, sub){\n  closePw();\n"
P_OLD_END = "function pwFocus(){"
a = t.count(P_OLD_START); b = t.count(P_OLD_END); assert a == 1 and b == 1, ('SIGNINLOOK pw block', a, b)
i0 = t.index(P_OLD_START); i1 = t.index(P_OLD_END, i0)
old = t[i0:i1]
for need in ["pwBox.id = 'gc-pw-screen'", "subEl.className = 'gc-pw-sub'", "function pwField(card, label, type, id, ac){", "function pwBtn(card, text, id){",
             "function pwLink(card, text, id, fn){", "function pwMsg(card){", "function pwSay(m, text, ok){"]:
    assert old.count(need) == 1, ('SIGNINLOOK pw piece', need)
assert len(old) < 4000, 'SIGNINLOOK pw block too long'
P_NEW = r"""function pwScreen(title, sub){   /* patch SIGNINLOOK: the original look */
  closePw();
  var sh = gcaShell('gc-pw-screen', title); pwBox = sh.root;
  var subEl = gcaHead(sh.box, title, sub || ''); subEl.className = 'gc-pw-sub';
  var card = el('form'); card.className = 'gca-card gca-pwcard'; sh.box.appendChild(card);
  card.setAttribute('autocomplete', 'on'); card.noValidate = true;
  var ft = el('div'); ft.className = 'gca-foot'; sh.box.appendChild(ft);
  var ct = el('p'); ct.className = 'gca-contact';
  var tel = el('a', '', '901-585-0944'); tel.href = 'tel:9015850944'; ct.appendChild(tel);
  ct.appendChild(el('span', '', '·'));
  var ml = el('a', '', 'info@grayco-cs.com'); ml.href = 'mailto:info@grayco-cs.com'; ct.appendChild(ml);
  ft.appendChild(ct);
  pwBox.addEventListener('keydown', function(ev){ ev.stopPropagation(); });
  if (document.body) document.body.appendChild(pwBox); else document.documentElement.appendChild(pwBox);
  return card;
}
function pwField(card, label, type, id, ac){
  return gcaInput(card, label, type, id, ac, type === 'email' ? '✉' : '🔒', '');   /* no e-mail placeholder here: the app's old-login detector looks for you@grayco-cs.com */
}
function pwBtn(card, text, id){
  var b = el('button', 'margin-top:4px', text); b.className = 'gca-btn';
  b.type = 'submit'; b.id = id; card.appendChild(b); return b;
}
function pwLink(card, text, id, fn){
  var b = el('button', '', text); b.className = 'gca-link gca-back';
  b.type = 'button'; b.id = id; b.onclick = fn; card.appendChild(b); return b;
}
function pwMsg(card){ var m = el('div'); m.className = 'gca-msg'; m.id = 'gc-pw-msg'; m.setAttribute('role', 'status'); card.appendChild(m); return m; }
function pwSay(m, text, ok){ m.className = ok ? 'gca-msg gca-ok' : 'gca-msg'; m.style.color = ok ? '#86efac' : '#fca5a5'; m.textContent = text; }
"""
t = t[:i0] + P_NEW + t[i1:]
assert t.count(MARK) >= 1
open(p, 'w', encoding='utf-8').write(t); print('SIGNINLOOK: patched')
