/* GrayCo website forms \u2014 paste into a Squarespace Code Block (docs/WEBSITE-TO-CRM.md):

     <div data-grayco-form="all"></div>
     <script src="https://crm.grayco-cs.com/website-form.js" defer></script>

   data-grayco-form = all | estimate | storm | commercial | maintenance | problem | careers | roof-price
   Everything sent lands in the GrayCo CRM (netlify/functions/website-intake.js) as a GrayCo lead, unassigned;
   job applications go to Payroll \u2192 Hiring. No keys or secrets live in this file.            (patch WEB) */
(function(){
'use strict';
if (window.__GRAYCO_FORMS__) { try { window.__GRAYCO_FORMS__.scan(); } catch (e) {} return; }
var me = document.currentScript;
var BASE = (me && me.src) ? me.src.replace(/\/[^\/]*$/, '') : 'https://crm.grayco-cs.com';
var NAVY = '#241968', GOLD = '#d4a017';
var CSS = ':host{all:initial;display:block;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#1b1640}'
 + '*{box-sizing:border-box}.w{max-width:640px;margin:0 auto;border:1px solid #e3e1ee;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 6px 24px rgba(36,25,104,.08)}'
 + '.hd{background:' + NAVY + ';color:#fff;padding:16px 20px;border-bottom:4px solid ' + GOLD + '}.hd b{display:block;font-size:19px;letter-spacing:.2px}.hd small{display:block;opacity:.85;font-size:13px;margin-top:3px}'
 + '.bd{padding:18px 20px 20px}.row{display:flex;gap:12px;flex-wrap:wrap}.row>label{flex:1 1 220px}'
 + 'label{display:block;font-size:13px;font-weight:600;margin:0 0 12px;color:#3b3563}label span{display:block;margin-bottom:5px}label i{font-style:normal;color:#b91c1c}'
 + 'input,select,textarea{width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1px solid #cfcbe3;border-radius:9px;background:#fbfbfe;color:#1b1640}'
 + 'input:focus,select:focus,textarea:focus{outline:2px solid ' + GOLD + ';outline-offset:1px;border-color:' + NAVY + ';background:#fff}textarea{min-height:110px;resize:vertical}'
 + '.types{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.types button{flex:1 1 180px;font:inherit;font-size:14px;font-weight:600;padding:10px 12px;border-radius:9px;border:1px solid #cfcbe3;background:#fff;color:' + NAVY + ';cursor:pointer;text-align:left}'
 + '.types button.on{background:' + NAVY + ';color:#fff;border-color:' + NAVY + '}'
 + '.go{width:100%;font:inherit;font-size:17px;font-weight:800;padding:14px;border:0;border-radius:10px;background:' + GOLD + ';color:' + NAVY + ';cursor:pointer;margin-top:4px}.go[disabled]{opacity:.6;cursor:wait}'
 + '.err{color:#b91c1c;font-size:14px;margin:8px 0 0;min-height:1em}.fine{font-size:12px;color:#6b6688;margin-top:10px;line-height:1.45}'
 + '.ok{text-align:center;padding:26px 10px}.ok .big{font-size:42px}.ok b{display:block;font-size:20px;margin:8px 0}.price{font-size:30px;font-weight:900;color:' + NAVY + ';margin:6px 0 4px}'
 + '.meas{display:inline-block;background:#f4f2fb;border-radius:8px;padding:8px 12px;font-size:13px;color:#3b3563;margin-top:8px}.hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}'
 + '.chk{display:flex;gap:9px;align-items:flex-start;font-weight:400;font-size:12.5px;line-height:1.4;color:#3b3563;margin:0 0 10px}.chk input{width:auto;margin:2px 0 0;flex:none}.chk span{display:block;margin:0}'
 + '.spin{display:inline-block;width:18px;height:18px;border:3px solid #e3e1ee;border-top-color:' + NAVY + ';border-radius:50%;animation:r 1s linear infinite;vertical-align:-4px;margin-right:8px}@keyframes r{to{transform:rotate(360deg)}}';
var TYPES = { estimate: 'Free estimate request', storm: 'Storm / insurance damage', commercial: 'Commercial bid inquiry', maintenance: 'Maintenance plan sign-up', problem: 'Report a problem (existing customer)', careers: 'Job application (careers)' };
var HEARD = ['Google', 'Facebook', 'A friend or neighbor (referral)', 'Yard sign', 'Our truck', 'Repeat customer', 'Insurance company', 'Other'];   /* patch X9 */
/* patch LEGAL3 (counsel review): the roof-price form no longer implies text consent. Two SEPARATE, UNCHECKED boxes, the same wording the CRM uses (patch SMSC2). */
var SMS_JOB = 'I agree to receive text messages from GrayCo Construction Services about my job (appointment and crew scheduling, job updates, estimates and invoices). Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.';
var SMS_MKT = 'I also agree to receive occasional promotional text messages from GrayCo Construction Services (seasonal service offers, up to 4 per month). Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.';
function smsBoxes(){ return '<label class="chk"><input type="checkbox" name="sms_job" value="yes"><span><b>Job texts:</b> ' + esc(SMS_JOB) + '</span></label>'
  + '<label class="chk"><input type="checkbox" name="sms_offers" value="yes"><span><b>Offers (optional, separate):</b> ' + esc(SMS_MKT) + '</span></label>'; }
var POS = ['Project Manager', 'Superintendent', 'Estimator', 'Carpenter', 'Roofer', 'Laborer', 'Office / Admin', 'Other'];
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function F(name, label, o){
  o = o || {}; var req = o.req ? ' required' : '', star = o.req ? ' <i>*</i>' : '';
  var inner = o.type === 'textarea' ? '<textarea name="' + name + '"' + req + ' maxlength="3000" placeholder="' + esc(o.ph || '') + '"></textarea>'
    : o.type === 'select' ? '<select name="' + name + '"' + req + '><option value="">Choose\u2026</option>' + o.opts.map(function(x){ return '<option>' + esc(x) + '</option>'; }).join('') + '</select>'
    : '<input name="' + name + '" type="' + (o.type || 'text') + '"' + req + (o.ac ? ' autocomplete="' + o.ac + '"' : '') + (o.accept ? ' accept="' + o.accept + '"' : '') + ' placeholder="' + esc(o.ph || '') + '">';
  return '<label><span>' + esc(label) + star + '</span>' + inner + '</label>';
}
function contact(req){ return '<div class="row">' + F('name', 'Your name', { req: true, ac: 'name' }) + F('phone', 'Phone', { type: 'tel', ac: 'tel', req: req }) + '</div><div class="row">' + F('email', 'E-mail', { type: 'email', ac: 'email', req: req }) + F('bestTime', 'Best time to reach you', { ph: 'e.g. weekdays after 4' }) + '</div>'; }
function addr(label){ return F('address', label || 'Property address', { ac: 'street-address', ph: 'Street address' }) + '<div class="row">' + F('city', 'City', { ac: 'address-level2' }) + F('zip', 'ZIP', { ac: 'postal-code' }) + '</div>'; }
function fields(t){
  if (t === 'storm') return contact() + addr() + '<div class="row">' + F('damageDate', 'Date of the storm / damage', { type: 'date' }) + F('carrier', 'Insurance company') + '</div><div class="row">' + F('claimFiled', 'Claim filed?', { type: 'select', opts: ['Not yet', 'Yes'] }) + F('claimNumber', 'Claim # (if you have one)') + '</div>' + F('message', 'What happened?', { type: 'textarea', ph: 'Hail, wind, a tree, a leak\u2026' });
  if (t === 'commercial') return '<div class="row">' + F('company', 'Company', { req: true, ac: 'organization' }) + F('project', 'Project name') + '</div>' + contact() + addr('Project address') + '<div class="row">' + F('bidDue', 'Bid due date', { type: 'date' }) + F('plansLink', 'Link to plans (optional)', { type: 'url', ph: 'https://' }) + '</div>' + F('message', 'Scope / trades', { type: 'textarea' });
  if (t === 'maintenance') return contact() + addr() + '<div class="row">' + F('property', 'Property type', { type: 'select', opts: ['Home', 'Business / commercial', 'Multi-family', 'Church / school'] }) + F('plan', 'Plan', { type: 'select', opts: ['Annual inspection', 'Twice a year', 'Not sure \u2014 call me'] }) + '</div>' + F('buildings', 'Number of buildings / approx. roof size') + F('message', 'Anything else?', { type: 'textarea' });
  if (t === 'problem') return contact() + addr('Address of the job we did') + F('urgency', 'How urgent is it?', { type: 'select', opts: ['Leaking / damage right now', 'Soon', 'Not urgent'] }) + F('message', 'Tell us what is going on', { type: 'textarea', req: true });
  if (t === 'careers') return '<div class="row">' + F('position', 'Position', { type: 'select', opts: POS, req: true }) + F('experience', 'Years of experience') + '</div>' + contact() + '<div class="row">' + F('city', 'City you live in') + F('availability', 'When can you start?') + '</div>' + F('resume', 'R\u00e9sum\u00e9 (PDF or Word, up to 4 MB)', { type: 'file', accept: '.pdf,.doc,.docx,.txt' }) + F('message', 'Tell us about yourself', { type: 'textarea' });
  return contact() + addr() + '<div class="row">' + F('service', 'What do you need?', { type: 'select', opts: ['Roof replacement', 'Roof repair', 'Remodel / renovation', 'Siding / gutters', 'Commercial work', 'Other'] }) + F('property', 'Property', { type: 'select', opts: ['Home', 'Business'] }) + '</div>' + F('message', 'Tell us about the project', { type: 'textarea' });
}
function api(path, body){
  return fetch(BASE + '/.netlify/functions/website-intake' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ j._status = r.status; return j; }); });
}
var CFG = null, cfgAt = 0;
function cfg(){ if (CFG && Date.now() - cfgAt < 20 * 3600000) return Promise.resolve(CFG); return api('?form=1').then(function(j){ if (j && j.token) { CFG = j; cfgAt = Date.now(); } return j; }); }
var tsLoading = null;
function turnstile(host, siteKey){
  if (!siteKey) return Promise.resolve(null);
  if (!tsLoading) tsLoading = new Promise(function(res){ var sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; sc.onload = function(){ res(window.turnstile); }; sc.onerror = function(){ res(null); }; document.head.appendChild(sc); });
  return tsLoading.then(function(T){ if (!T) return null; var d = document.createElement('div'); d.slot = 'ts'; host.appendChild(d); var st = { tok: '' }; T.render(d, { sitekey: siteKey, callback: function(t){ st.tok = t; } }); return st; });
}
function fileB64(file){ return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(String(fr.result).replace(/^data:[^,]*,/, '')); }; fr.onerror = rej; fr.readAsDataURL(file); }); }

function mount(host){
  if (host.__gcw) return; host.__gcw = true;
  var want = String(host.getAttribute('data-grayco-form') || 'all').toLowerCase();
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var roof = want === 'roof-price' || want === 'roofprice';
  var type = TYPES[want] ? want : 'estimate', ts = null;
  function head(){ return roof ? '<div class="hd"><b>Instant roof price</b><small>GrayCo Construction Services \u2014 enter your address, see a ballpark price in seconds</small></div>'
    : '<div class="hd"><b>' + (TYPES[want] ? esc(TYPES[want]) : 'Contact GrayCo Construction') + '</b><small>GrayCo Construction Services \u00b7 Bartlett, TN \u00b7 901-585-0944</small></div>'; }
  function form(){
    var picker = !roof && !TYPES[want] ? '<div class="types">' + Object.keys(TYPES).map(function(k){ return '<button type="button" data-t="' + k + '" class="' + (k === type ? 'on' : '') + '">' + esc(TYPES[k]) + '</button>'; }).join('') + '</div>' : '';
    var body = roof ? '<p class="fine" style="margin:0 0 12px;font-size:14px">We measure your roof from satellite imagery. Tell us where to send your price:</p>' + addr('Home address') + '<div class="row">' + F('name', 'Your name', { req: true, ac: 'name' }) + F('phone', 'Phone', { type: 'tel', ac: 'tel', req: true }) + '</div>' + F('email', 'E-mail', { type: 'email', ac: 'email', req: true }) + smsBoxes()
      : fields(type) + (type !== 'careers' ? F('howHeard', 'How did you hear about us?', { type: 'select', opts: HEARD }) : '');   /* patch X9 */
    return '<style>' + CSS + '</style><div class="w">' + head() + '<form class="bd" novalidate>' + picker + body
      + '<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><slot name="ts"></slot>'
      + '<button class="go" type="submit">' + (roof ? 'Show my price' : type === 'careers' ? 'Send my application' : 'Send') + '</button><div class="err" role="alert"></div>'
      + '<div class="fine">' + (roof ? 'By asking for a price you agree GrayCo may call or e-mail you about your roof. GrayCo sends text messages only if you tick a box above. The price is a ballpark \u2014 the final price comes after a free inspection.' : 'We reply within one business day. Your information is only used by GrayCo Construction Services.') + '</div></form></div>';
  }
  function draw(){
    root.innerHTML = form();
    var fm = root.querySelector('form');
    root.querySelectorAll('[data-t]').forEach(function(b){ b.onclick = function(){ type = b.getAttribute('data-t'); draw(); }; });
    fm.onsubmit = function(e){ e.preventDefault(); send(fm); };
    cfg().then(function(c){ if (c && c.turnstileSiteKey && !ts) turnstile(host, c.turnstileSiteKey).then(function(x){ ts = x; }); });
  }
  function done(html){ root.innerHTML = '<style>' + CSS + '</style><div class="w">' + head() + '<div class="bd ok">' + html + '</div></div>'; }
  function send(fm){
    var err = fm.querySelector('.err'), go = fm.querySelector('.go');
    var miss = Array.prototype.filter.call(fm.querySelectorAll('[required]'), function(x){ return !String(x.value || '').trim(); })[0];
    if (miss) { err.textContent = 'Please fill in ' + (miss.closest('label').querySelector('span').textContent.replace('*', '').trim()) + '.'; miss.focus(); return; }
    var body = { type: roof ? 'roofprice' : type, page: location.href.slice(0, 300) };
    Array.prototype.forEach.call(fm.elements, function(x){ if (!x.name || x.type === 'file') return; if (x.type === 'checkbox') { if (x.checked) body[x.name] = 'yes'; return; } body[x.name] = x.value; });   /* patch LEGAL3: a box counts only when ticked */
    var file = fm.querySelector('input[type=file]'), f = file && file.files && file.files[0];
    if (f && f.size > 4 * 1024 * 1024) { err.textContent = 'That file is larger than 4 MB \u2014 please attach a smaller one.'; return; }
    go.disabled = true; err.textContent = ''; go.innerHTML = '<span class="spin"></span>' + (roof ? 'Measuring your roof\u2026' : 'Sending\u2026');
    var resumeP = f ? fileB64(f).then(function(b){ body.resume = { name: f.name, type: f.type || 'application/octet-stream', data: b }; }) : Promise.resolve();
    resumeP.then(cfg).then(function(c){
      body.token = c && c.token; if (ts && ts.tok) body.turnstile = ts.tok;
      return api(roof ? '?act=roofprice' : '', body);
    }).then(function(j){
      if (j && j.ok) {
        if (roof) return done(j.priced ? '<div class="big">\ud83c\udfe0</div><b>Your ballpark price</b><div class="price">' + esc(j.range) + '</div><div class="meas">Roof \u2248 ' + Number(j.areaSqft).toLocaleString() + ' sq ft \u00b7 ' + esc(j.squares) + ' squares' + (j.pitch != null ? ' \u00b7 ' + esc(j.pitch) + '/12 pitch' : '') + '</div><p class="fine">' + esc(j.message) + '</p>'
          : '<div class="big">\u2705</div><b>Thanks, ' + esc(String(body.name).split(' ')[0]) + '!</b><p>' + esc(j.message) + '</p>');
        return done('<div class="big">\u2705</div><b>Thank you!</b><p>' + esc(j.message || 'We received it and will be in touch shortly.') + '</p>');
      }
      go.disabled = false; go.textContent = roof ? 'Show my price' : 'Send';
      if (j && j._status === 400 && /reload/i.test(j.error || '')) { CFG = null; }
      err.textContent = (j && j.error) || 'Something went wrong \u2014 please call 901-585-0944.';
    }).catch(function(){ go.disabled = false; go.textContent = roof ? 'Show my price' : 'Send'; err.textContent = 'Could not send \u2014 check your connection, or call 901-585-0944.'; });
  }
  draw();
}
function scan(){ Array.prototype.forEach.call(document.querySelectorAll('[data-grayco-form]'), mount); }
window.__GRAYCO_FORMS__ = { scan: scan, base: BASE };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
/* Squarespace loads some pages without a full reload (Ajax loading): look again when the page changes */
try { new MutationObserver(function(){ scan(); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})();
