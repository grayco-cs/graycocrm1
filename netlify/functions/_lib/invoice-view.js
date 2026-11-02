/* netlify/functions/_lib/invoice-view.js — patch CUSTPORTAL: THE CRM'S OWN CUSTOMER INVOICE in the customer portal.

   Owner (11/02): "make sure my estimate in PDF form and my template and invoice show the way I made it in the CRM. The blue
   animated screen should be my invoice." The "blue animated screen" is the CRM's invoice view, window._gcViewInvoicePDF in
   index.html (Invoices → 📄 / "Create & send"; also saved as Invoice-<n>.html for e-mail): a dark navy page with floating
   blue / cyan / violet light, a shimmering top bar, the GrayCo header, the total counting up, and "⬇️ Download PDF" (the
   browser's print → a white paper version). Until now the portal showed its own plain PDF (invoice-pdf.js) instead.

   build(o) → that SAME html. The `var html = [ … ].join('')` block below is a VERBATIM copy of the CRM's (tools/tests/
   test_CUSTPORTAL_E2E.mjs fails the moment the two differ — copy the CRM's block here again after changing the design).
   What differs is only what the CRM reads from the computer it runs on:
     · the account (window._gcAccountFor): in the CRM today the name is taken by the chart-of-accounts helper (index.html
       defines it twice), so the CRM's invoice shows the job's client + address and "Net 30" — the same here;
     · the Google review link (that computer's localStorage) → the portal's own review link, once the job is at its end;
     · ACH bank details (that computer's localStorage) → never sent by the server: the paragraph "available on request" stays;
     · "📷 View Job Photos" (CompanyCam) → not shown: the portal never links to CompanyCam (patch U2);
     · the GrayCo header (window._gcDocHeader, patch LOGO2) → docHeader() below, the same markup; the white logo comes from
       /img/grayco-logo-white.png (served on the portal host), the colour one (print) is embedded.
   Every text from the CRM is HTML-escaped first (the CRM writes it raw into its own window). */
'use strict';
const LOGO = require('./logo-wide.js');
function whiteLogo(){ try { return 'data:image/png;base64,' + require('./logo-white.js').pngBase64; } catch (e) { return '/img/grayco-logo-white.png'; } }
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function escObj(o){ const out = {}; Object.keys(o || {}).forEach(function(k){ const v = o[k]; out[k] = typeof v === 'string' ? esc(v) : (v && typeof v === 'object' ? undefined : v); }); return out; }
const NAME = 'GrayCo Construction Services', PHONE = '901-585-0944', WEB = 'grayco-cs.com', LIC = 'TN #85034 BCB · AR #0486990627 · MS #27769';
const LOGO_RATIO = 420 / 254;
function coAddr(){ try { return s(require('./brand.js').companyAddress()); } catch (e) { return ''; } }
function colourLogo(){ const b = LOGO && (LOGO.jpegBase64 || LOGO.b64); return b ? 'data:image/jpeg;base64,' + b : 'https://crm.grayco-cs.com/grayco-logo.jpg'; }
/* index.html W._gcDocHeader (patch LOGO2), the same markup */
function docHeader(o){
  o = o || {};
  const a = o.address === false ? '' : coAddr(), dual = !!o.dual, dk = !!o.dark || dual;
  const line2 = [a, PHONE, s(o.email), WEB].filter(Boolean).map(esc).join(' · ');
  const lw = Math.round(67 * (dk ? 340 / 192 : LOGO_RATIO)), lc = Math.round(67 * LOGO_RATIO);
  const img = function(src, cls, w){ return '<img data-gc-logo-img="1" class="' + cls + '" src="' + esc(src) + '" alt="' + NAME + '" width="' + w + '" height="67" style="height:0.7in;width:auto;margin:0 auto 4px;border:0' + (dual ? '' : ';display:block') + '">'; };
  const WHITE = s(o.whiteLogo) || whiteLogo();
  return (dual ? '<style>.gc-dual img{display:block}.gc-dual .gc-p{display:none}@media print{.gc-dual .gc-d{display:none!important}.gc-dual .gc-p{display:block!important}.gc-dual .gc-t1{color:#0f2440!important;-webkit-text-fill-color:#0f2440!important}.gc-dual .gc-t2{color:#333!important}.gc-dual .gc-t3{color:#555!important}}</style>' : '')
    + '<div data-gc-logo="1" class="gc-doc-head' + (dual ? ' gc-dual' : '') + '" style="font-family:Arial,Helvetica,sans-serif;text-align:center;' + (dk ? 'margin:0;padding:0;' : 'border-bottom:2px solid #241968;padding:0 0 8px;margin:0 0 12px;') + 'page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact">'
    + (dual ? img(WHITE, 'gc-d', lw) + img(colourLogo(), 'gc-p', lc) : img(dk ? WHITE : colourLogo(), '', lw))
    + '<div class="gc-t1" style="font-size:15pt;font-weight:800;line-height:1.3;text-align:center;color:' + (dk ? '#fff' : '#0f2440') + ';letter-spacing:.3px">' + NAME + '</div>'
    + '<div class="gc-t2" style="font-size:9.5pt;font-weight:400;line-height:1.4;text-align:center;color:' + (dk ? '#cfd8e6' : '#333') + '">' + line2 + '</div>'
    + (o.noLicense ? '' : '<div class="gc-t3" style="font-size:8.5pt;font-weight:400;line-height:1.4;text-align:center;color:' + (dk ? '#9fb0c8' : '#555') + '">' + LIC + '</div>') + '</div>';
}
/* o: { inv (the CRM's invoice record), proj (its job), reviewUrl, whiteLogo } → { html, number } */
function build(o){
  o = o || {};
  const invId = s(o.inv && o.inv.id);
  const inv = escObj(o.inv), proj = escObj(o.proj);
  const window = { _gcDocHeader: function(h){ return docHeader(Object.assign({}, h, { whiteLogo: o.whiteLogo })); } };   /* the CRM's global, for the verbatim block */
  /* ── as in index.html _gcViewInvoicePDF ── */
  const amt = parseFloat(inv.amt) || 0;
  const invNum = s(o.number) ? esc(o.number) : (inv.po ? ('INV-' + inv.po) : ('INV-' + String(invId).slice(-6)));   /* o.number: an invoice the CRM numbers itself (maintenance plans) */
  const fmt = function(v){ return '$' + (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const dt = function(d){ try { return new Date((d || '') + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return d || ''; } };
  const _acct = { name: proj.client || '', apContact: '', apEmail: '', apPhone: '', apAddress: proj.address || '', terms: 'Net 30' };
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const _gcReviewUrl = /^https:\/\/[^\s"'<>]+$/.test(s(o.reviewUrl)) ? esc(o.reviewUrl) : '';
  const _ach = {}, _achShow = false;
  const _ccUrl = '';
  const _topAmt = (parseFloat(amt) || 0);
  const _grandAmt = ((String(inv.status || '').toLowerCase() === 'paid') ? 0 : (parseFloat(amt) || 0));
  void logo; void _ach; void _achShow; void _topAmt;
  /* ═══ VERBATIM from index.html window._gcViewInvoicePDF (do not edit here — copy the CRM's block) ═══ */
      var html = [
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice '+invNum+'</title>',
        '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">',
        '<style>',
        '*{box-sizing:border-box;margin:0;padding:0;}',
        'body{font-family:Inter,-apple-system,sans-serif;color:#e8eefb;background:#060b16;padding:40px 16px;min-height:100vh;-webkit-print-color-adjust:exact;print-color-adjust:exact;position:relative;overflow-x:hidden;}',
        '.orb{position:fixed;border-radius:50%;filter:blur(70px);opacity:.5;z-index:0;animation:float 14s ease-in-out infinite;}',
        '.orb.a{width:360px;height:360px;background:#1d4ed8;top:-120px;left:-100px;}.orb.b{width:320px;height:320px;background:#0e7490;bottom:-120px;right:-80px;animation-delay:-5s;}.orb.c{width:260px;height:260px;background:#6d28d9;top:40%;right:20%;animation-delay:-9s;opacity:.35;}',
        '@keyframes float{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(30px,-30px) scale(1.08);}}',
        '.sheet{position:relative;z-index:2;max-width:780px;margin:0 auto;background:linear-gradient(160deg,rgba(17,29,54,.92),rgba(9,17,34,.96));border:1px solid rgba(120,150,220,.18);border-radius:22px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);animation:sheetIn .8s cubic-bezier(.2,.7,.2,1) both;}',
        '@keyframes sheetIn{from{opacity:0;transform:translateY(28px) scale(.98);}to{opacity:1;transform:none;}}',
        '.topbar{height:5px;background:linear-gradient(90deg,#3b82f6,#22d3ee,#8b5cf6,#3b82f6);background-size:300% 100%;animation:shimmer 6s linear infinite;}@keyframes shimmer{0%{background-position:0 0;}100%{background-position:300% 0;}}',
        '.anim{opacity:0;animation:up .7s cubic-bezier(.2,.7,.2,1) forwards;}@keyframes up{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}',
        '.d1{animation-delay:.15s;}.d2{animation-delay:.28s;}.d3{animation-delay:.4s;}.d5{animation-delay:.64s;}.d6{animation-delay:.76s;}',
        '.head{display:flex;flex-direction:column;align-items:center;text-align:center;padding:36px 40px 26px;gap:14px;}.head .right{display:flex;flex-direction:column;align-items:center;text-align:center;}.head .fromblock{order:-1;margin:0 0 12px;padding:0;border:0;}.head .fromblock .flabel{display:none;}',
        '.logo-block{display:flex;flex-direction:column;align-items:center;}',
        '.roof{width:230px;height:44px;overflow:visible;margin-bottom:6px;}.roof path,.roof rect{fill:none;stroke:#dbe8ff;stroke-width:7;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 6px rgba(120,180,255,.5));}',
        '.logo-name{font-family:Sora;font-weight:800;font-size:56px;letter-spacing:3px;line-height:.9;background:linear-gradient(110deg,#a9c8ff 18%,#fff 43%,#fff 50%,#7fb4ff 57%,#a9c8ff 82%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:shine 3.6s linear infinite;filter:drop-shadow(0 0 12px rgba(120,180,255,.35));}',
        '@keyframes shine{0%{background-position:160% 0;}100%{background-position:-160% 0;}}',
        '.logo-sub{font-family:Sora;font-weight:600;font-size:12.5px;letter-spacing:7px;color:#8fb0e6;margin-top:6px;padding-left:3px;}',
        '.right{text-align:center;min-width:240px;}',
        '.word{font-family:Sora;font-weight:800;font-size:38px;letter-spacing:2px;background:linear-gradient(90deg,#fff,#a9c8ff);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1;}',
        '.num{margin-top:7px;font-size:13px;font-weight:600;color:#22d3ee;letter-spacing:2px;}',
        '.fromblock{margin-top:16px;padding-top:14px;border-top:1px solid rgba(130,160,220,.2);}',
        '.fromblock .flabel{font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#8ba3cc;font-weight:600;margin-bottom:5px;}',
        '.fromblock .fname{font-family:Sora;font-size:13.5px;font-weight:600;color:#eaf1ff;}.fromblock .fline{font-size:12px;color:#a9b8d4;line-height:1.65;margin-top:2px;}',
        '.summary{margin:4px 40px 0;display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:14px;}',
        '.card{background:rgba(255,255,255,.045);border:1px solid rgba(130,160,220,.16);border-radius:14px;padding:16px 18px;transition:.3s;}.card:hover{transform:translateY(-3px);border-color:rgba(120,180,255,.4);box-shadow:0 10px 30px rgba(30,80,180,.25);}',
        '.card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#8ba3cc;font-weight:600;margin-bottom:6px;}.card .val{font-size:15px;font-weight:600;color:#eaf1ff;}',
        '.card.total{background:linear-gradient(135deg,rgba(59,130,246,.22),rgba(34,211,238,.14));border-color:rgba(80,200,255,.4);}.card.total .val{font-family:Sora;font-size:26px;font-weight:800;color:#fff;}',
        '.body{padding:26px 40px 6px;}.lbl2{font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#8ba3cc;font-weight:600;margin-bottom:6px;}',
        '.name{font-family:Sora;font-size:17px;font-weight:600;color:#fff;}.line{font-size:12.5px;color:#a9b8d4;line-height:1.7;margin-top:3px;}',
        '.chip{display:inline-block;margin-top:10px;background:rgba(59,130,246,.18);border:1px solid rgba(90,150,255,.35);color:#bfdaff;font-size:11.5px;font-weight:600;padding:5px 14px;border-radius:999px;}',
        'table{width:100%;border-collapse:collapse;margin:24px 0 6px;}thead th{font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#8ba3cc;font-weight:600;padding:0 4px 12px;text-align:left;border-bottom:1px solid rgba(130,160,220,.22);}thead th:last-child{text-align:right;}',
        'tbody td{padding:15px 4px;border-bottom:1px solid rgba(130,160,220,.1);font-size:14px;vertical-align:top;}tbody td:last-child{text-align:right;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;color:#eaf1ff;}',
        '.desc-main{font-weight:500;color:#e8eefb;}.desc-sub{font-size:12px;color:#7f93b5;margin-top:3px;}',
        '.totals{display:flex;justify-content:flex-end;margin-top:12px;}.totals-inner{width:300px;}.trow{display:flex;justify-content:space-between;padding:8px 2px;font-size:13.5px;color:#a9b8d4;}',
        '.trow.grand{margin-top:10px;padding:16px 20px;border-radius:14px;background:linear-gradient(135deg,#3b82f6,#22d3ee);color:#04122b;font-family:Sora;font-weight:800;font-size:17px;align-items:center;box-shadow:0 12px 30px rgba(34,150,240,.4);position:relative;overflow:hidden;}',
        '.trow.grand::after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);transform:translateX(-120%);animation:sweep 3.2s ease-in-out 1.2s infinite;}@keyframes sweep{0%{transform:translateX(-120%);}60%,100%{transform:translateX(120%);}}',
        '.trow.grand .amt{font-size:23px;position:relative;z-index:2;}',
        '.review{margin:30px 40px 0;padding:22px 26px;border-radius:16px;text-align:center;background:radial-gradient(circle at 50% 0%,rgba(139,92,246,.16),rgba(255,255,255,.03));border:1px solid rgba(150,130,240,.24);}',
        '.review h3{font-family:Sora;font-size:17px;color:#fff;margin-bottom:8px;font-weight:600;}.review .stars span{display:inline-block;color:#fbbf24;font-size:22px;opacity:0;transform:scale(.3);animation:pop .4s cubic-bezier(.2,1.6,.4,1) forwards;}',
        '.review .stars span:nth-child(1){animation-delay:.9s;}.review .stars span:nth-child(2){animation-delay:1.02s;}.review .stars span:nth-child(3){animation-delay:1.14s;}.review .stars span:nth-child(4){animation-delay:1.26s;}.review .stars span:nth-child(5){animation-delay:1.38s;}@keyframes pop{to{opacity:1;transform:scale(1);}}',
        '.review p{font-size:12.5px;color:#a9b8d4;margin:10px 0 16px;}.review a{display:inline-block;text-decoration:none;font-weight:700;font-size:13px;padding:12px 28px;border-radius:999px;color:#fff;background:linear-gradient(135deg,#8b5cf6,#3b82f6);box-shadow:0 8px 24px rgba(110,90,240,.4);transition:.25s;}.review a:hover{transform:translateY(-2px) scale(1.03);}',
        '.pay{margin:22px 40px 0;font-size:12.5px;color:#9fb0cf;line-height:1.8;}.pay b{color:#dce6fa;}',
        '.foot{margin:28px 40px 0;padding:20px 0 34px;border-top:1px solid rgba(130,160,220,.14);text-align:center;font-size:11px;color:#7f93b5;line-height:1.7;}',
        '.print-btn{display:block;width:max-content;margin:0 auto 30px;background:rgba(255,255,255,.08);border:1px solid rgba(150,180,240,.3);color:#cfe0ff;border-radius:999px;padding:11px 26px;font-size:12.5px;font-weight:600;cursor:pointer;}',
        '.actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:6px 0 30px;}',
        '.act-btn{display:inline-flex;align-items:center;gap:7px;text-decoration:none;border-radius:999px;padding:12px 24px;font-size:12.5px;font-weight:700;cursor:pointer;border:1px solid rgba(150,180,240,.3);transition:.25s;}',
        '.act-pdf{background:linear-gradient(135deg,#3b82f6,#22d3ee);color:#04122b;border:none;box-shadow:0 8px 22px rgba(34,150,240,.35);}',
        '.act-cc{background:rgba(255,255,255,.08);color:#cfe0ff;}',
        '.act-btn:hover{transform:translateY(-2px);}',
        '@media print{.actions{display:none;}}',
        '@media print{body{background:#fff;padding:0;color:#111;}.orb{display:none;}.sheet{box-shadow:none;border:none;animation:none;background:#fff;}.anim{animation:none!important;opacity:1!important;}.trow.grand::after{display:none;}.print-btn{display:none;}',
        '.word{color:#0b1f42;-webkit-text-fill-color:#0b1f42;}.logo-name{color:#0b1f42;-webkit-text-fill-color:#0b1f42;animation:none;filter:none;}.roof path,.roof rect{stroke:#0b1f42;filter:none;}.logo-sub{color:#0b1f42;}.name,.review h3{color:#0b1f42;}.line,.fline,.desc-sub,.pay,.foot,.trow,.card .lbl,.lbl2,.fromblock .flabel{color:#444;}.desc-main,.card .val,.fname{color:#111;}.card{border-color:#ddd;}}',
        '@media(max-width:560px){.head{flex-direction:column;}.right{text-align:center;min-width:0;}.summary{grid-template-columns:1fr;margin:4px 22px 0;}.body,.pay,.foot,.head{padding-left:22px;padding-right:22px;}.review{margin:24px 22px 0;}.logo-name{font-size:46px;}.roof{width:190px;}}',
        '</style></head><body>',
        '<img src="https://graycocrm1.netlify.app/.netlify/functions/invoice-track?hit='+encodeURIComponent(invId)+'" alt="" width="1" height="1" style="position:absolute;left:-9999px;">',
        '<div class="orb a"></div><div class="orb b"></div><div class="orb c"></div>',
        '<div class="sheet"><div class="topbar"></div>',
        '<div class="head">',
          '<div class="anim d1" style="align-self:stretch">'+(window._gcDocHeader?window._gcDocHeader({dual:true,email:'billing@grayco-cs.com'}):'')+'</div>',
          '<div class="right anim d1"><div class="word">INVOICE</div><div class="num">'+invNum+'</div>',
          '</div>',
        '</div>',
        '<div class="summary">',
          '<div class="card anim d2"><div class="lbl">Invoice Date</div><div class="val">'+dt(inv.date)+'</div></div>',
          '<div class="card anim d2"><div class="lbl">'+((String(inv.status||'').toLowerCase()==='paid')?'Paid On':'Due Date')+'</div><div class="val">'+((String(inv.status||'').toLowerCase()==='paid')?(dt(inv.paidDate)||'—'):(inv.due?dt(inv.due):'Upon receipt'))+'</div></div>',
          '<div class="card total anim d3"><div class="lbl">'+((String(inv.status||'').toLowerCase()==='paid')?'Amount Paid':'Total Due')+'</div><div class="val" id="topTotal">'+fmt(amt)+'</div></div>',
        '</div>',
        '<div class="body">',
          '<div class="anim d3"><div class="lbl2">Bill To</div><div class="name">'+(_acct.name||proj.client||'—')+'</div>',
          '<div class="line">'+(_acct.apContact?('Attn: '+_acct.apContact+' &middot; '):'')+(_acct.apAddress||proj.address||'')+(_acct.apEmail?('<br>'+_acct.apEmail):'')+(_acct.apPhone?(' &middot; '+_acct.apPhone):'')+'</div>',
          (proj.name?('<div class="chip">'+proj.name+(proj.autoPO?(' &middot; PO '+proj.autoPO):'')+'</div>'):'')+'</div>',
          '<table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>',
            '<tr><td><div class="desc-main">'+((inv.drawType||inv.desc||'Construction services')+(proj.name?(' — '+proj.name):''))+'</div>'+(inv.desc&&inv.drawType&&inv.desc!==inv.drawType?('<div class="desc-sub">'+inv.desc+'</div>'):'')+'</td><td>'+fmt(amt)+'</td></tr>',
          '</tbody></table>',
          '<div class="totals anim d5"><div class="totals-inner">',
            '<div class="trow"><span>Subtotal</span><span>'+fmt(amt)+'</span></div>',
            '<div class="trow"><span>Payments received</span><span>'+((String(inv.status||'').toLowerCase()==='paid')?fmt(amt):fmt(0))+'</span></div>',
            '<div class="trow grand"><span>'+((String(inv.status||'').toLowerCase()==='paid')?'Paid in Full':'Total Due')+'</span><span class="amt" id="grandTotal">'+((String(inv.status||'').toLowerCase()==='paid')?fmt(0):fmt(amt))+'</span></div>',
          '</div></div>',
        '</div>',
        (_achShow?('<div style="margin:0 40px 8px;padding:18px 20px;background:#0b1f42;border:1px solid #1e3a5f;border-radius:14px;"><div style="color:#22d3ee;font-weight:800;font-size:14px;margin-bottom:8px;">\uD83C\uDFE6 Pay by Bank Transfer (ACH) \u2014 no fees</div><table style="width:100%;font-size:13px;color:#cfe0ff;border-collapse:collapse;">'+(_ach.bankName?('<tr><td style="padding:3px 0;color:#8fa8c4;">Bank</td><td style="text-align:right;font-weight:700;">'+_ach.bankName+'</td></tr>'):'')+(_ach.accountName?('<tr><td style="padding:3px 0;color:#8fa8c4;">Account name</td><td style="text-align:right;font-weight:700;">'+_ach.accountName+'</td></tr>'):'')+(_ach.routing?('<tr><td style="padding:3px 0;color:#8fa8c4;">Routing #</td><td style="text-align:right;font-weight:700;">'+_ach.routing+'</td></tr>'):'')+(_ach.account?('<tr><td style="padding:3px 0;color:#8fa8c4;">Account #</td><td style="text-align:right;font-weight:700;">'+_ach.account+'</td></tr>'):'')+'</table>'+(_ach.instructions?('<div style="margin-top:8px;color:#8fa8c4;font-size:12px;">'+_ach.instructions+'</div>'):'')+'<div style="margin-top:8px;color:#94a3b8;font-size:11.5px;">Please include invoice '+invNum+' in the memo.</div></div>'):''),
        (_gcReviewUrl?('<div class="review anim d5"><h3>Happy with our work?</h3><div class="stars"><span>&#9733;</span><span>&#9733;</span><span>&#9733;</span><span>&#9733;</span><span>&#9733;</span></div><p>A quick Google review means the world to a local business like ours.</p><a href="'+_gcReviewUrl+'" target="_blank">Leave us a Google Review &rarr;</a></div>'):''),
        '<div class="pay anim d6"><b>Payment:</b> Make checks payable to GrayCo Construction Services, LLC, mailed to the address above.<br><b>Bank transfer (ACH):</b> Available on request &mdash; contact us for routing details.<br><b>Terms:</b> '+(_acct.terms||'Net 30')+' &mdash; please remit by the due date. Questions? Reply to this email or call (901) 585-0944.</div>',
        '<div class="foot anim d6">Thank you for your business.</div>',   /* patch LOGO2: the company line is in the header */
        (proj.ccamUrl?('<div style="text-align:center;margin-top:4px;"></div>'):'')+'<div class="actions">'+(_ccUrl?('<a class="act-btn act-cc" href="'+_ccUrl+'" target="_blank">\uD83D\uDCF7 View Job Photos</a>'):'')+'<button class="act-btn act-pdf" onclick="window.print()">\u2B07\uFE0F Download PDF</button>'+'</div>',
        '</div>',
        '<script>function countUp(el,t){var s=null,d=1100;function step(ts){if(!s)s=ts;var p=Math.min((ts-s)/d,1);var e=1-Math.pow(1-p,3);el.textContent="$"+(t*e).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});if(p<1)requestAnimationFrame(step);}requestAnimationFrame(step);}window.addEventListener("load",function(){try{fetch("https://graycocrm1.netlify.app/.netlify/functions/invoice-track?hit='+encodeURIComponent(invId)+'",{mode:"no-cors"});}catch(e){}setTimeout(function(){var g=document.getElementById("grandTotal");if(g)countUp(g,'+ _grandAmt +');},700);setTimeout(function(){var t=document.getElementById("topTotal");if(t)countUp(t,'+ _topAmt +');},500);});<\/script>',
        '</body></html>'
      ].join('');
  /* ═══ end of the verbatim block ═══ */
  return { html: html, number: invNum };
}
/* an invoice made on the server (portal-plus.js maintenance plans: the invoice-pdf.js doc shape) → the same CRM design */
function fromDoc(doc){
  doc = doc || {};
  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  const paid = (+doc.balance || 0) <= 0 && (+doc.total || 0) > 0;
  return { number: s(doc.number), inv: { id: s(doc.number), amt: +doc.total || 0, status: paid ? 'paid' : 'open', date: s(doc.date), due: s(doc.due), paidDate: paid ? s(doc.date) : '',
      drawType: lines.length === 1 ? s(lines[0].desc) : (s(doc.job) || 'Invoice'), desc: lines.length > 1 ? lines.map(function(l){ return s(l.desc) + (l.amt != null ? ' ($' + (+l.amt || 0).toFixed(2) + ')' : ''); }).join(' · ') : '' },
    proj: { name: s(doc.job), client: s(doc.client), address: s(doc.address), autoPO: s(doc.po) } };
}
/* the e-mail attachment: the invoice as one .html file — what the CRM itself attaches (_gcDownloadCustomerInvoice): the customer
   opens it in any browser, sees it as designed, and its ⬇️ Download PDF saves the PDF */
function attachment(o){ const v = build(o); return { filename: 'Invoice-' + v.number.replace(/[^A-Za-z0-9_.-]/g, '') + '.html', content: Buffer.from(v.html, 'utf8').toString('base64'), number: v.number }; }
module.exports = { build, docHeader, fromDoc, attachment, VERBATIM_START: '      var html = [', VERBATIM_END: "      ].join('');" };
