// The HTML for one landing page (build-pages.mjs calls render()). Plain HTML and a little CSS so the page is fast
// (Google Ads Quality Score and Core Web Vitals) and readable by every search engine without JavaScript.
// The form and the tracking come from /gc-track.js.

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsonLd = o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';
const cld = (u, w) => /res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(u) ? u.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_fill,w_${w},h_${Math.round(w * 0.66)}/`) : u;

const CSS = `
:root{color-scheme:light;--paper:#F6F5F1;--paper-2:#EEEDE6;--ink:#171055;--body:#33333D;--mute:#62626C;--line:rgba(23,16,85,.16);--accent:#EE5F1C;--card:#fff;
--disp:"Archivo",system-ui,sans-serif;--sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--body);font:16px/1.6 var(--sans);padding-bottom:72px}
a{color:var(--ink)}img{max-width:100%;display:block}
.w{max-width:1120px;margin:0 auto;padding:0 16px}
.top{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.top .w{display:flex;align-items:center;gap:16px;height:64px}.top img{height:40px;width:auto}
.top nav{margin-left:auto;display:flex;gap:18px;align-items:center;font-weight:600;font-size:15px}.top nav a{text-decoration:none}
.top .ph{background:var(--ink);color:#fff;padding:9px 14px;border-radius:4px;white-space:nowrap}
@media (max-width:760px){.top nav .hide{display:none}}
.hero{background:var(--ink);color:#fff;padding:40px 0 48px}
.hero .w{display:grid;grid-template-columns:1.15fr .85fr;gap:40px;align-items:start}
@media (max-width:900px){.hero .w{grid-template-columns:1fr}}
.kick{font:600 13px/1.3 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:#F7B28C}
h1{font:800 clamp(32px,5vw,54px)/1.04 var(--disp);font-stretch:85%;margin:10px 0 16px;color:#fff;letter-spacing:-.01em}
.hero p.lead{font-size:18px;color:#E4E2F2;max-width:60ch;margin:0 0 22px}
.btns{display:flex;flex-wrap:wrap;gap:10px}
.btn{display:inline-flex;align-items:center;gap:8px;font:700 16px var(--sans);padding:14px 20px;border-radius:4px;text-decoration:none;border:2px solid transparent;cursor:pointer}
.btn.o{background:var(--accent);color:#fff}.btn.g{border-color:rgba(255,255,255,.55);color:#fff;background:transparent}
.trust{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px;padding:0;list-style:none}
.trust li{font-size:13px;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:5px 12px;color:#F6F5F1}
.form{background:#fff;color:var(--body);border-radius:6px;padding:20px;box-shadow:0 24px 44px -30px rgba(0,0,0,.6)}
.form h2{font:800 22px/1.2 var(--disp);color:var(--ink);margin:0 0 4px}.form p.sm{margin:0 0 12px;font-size:14px;color:var(--mute)}
.form label{display:block;font-size:13px;font-weight:600;color:var(--ink);margin:10px 0 4px}
.form input,.form textarea{width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1px solid #c9c7d6;border-radius:4px;background:#fbfbfd;color:var(--body)}
.form textarea{min-height:84px;resize:vertical}.form .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.form button{width:100%;margin-top:14px;justify-content:center}.form .msg{font-size:14px;margin:10px 0 0}.form .hp{position:absolute;left:-9999px}
section{padding:52px 0}section.alt{background:#fff}
h2.s{font:800 clamp(26px,3.4vw,38px)/1.1 var(--disp);font-stretch:85%;color:var(--ink);margin:0 0 22px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.it{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:16px}.alt .it{background:var(--paper)}
.it h3{font:700 17px/1.3 var(--sans);color:var(--ink);margin:0 0 6px}.it p{margin:0;font-size:15px}
.pj{background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden}
.pj img{aspect-ratio:3/2;object-fit:cover;width:100%;background:var(--paper-2)}.pj div{padding:14px 16px}
.pj .tag{font:600 12px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.pj h3{font:700 17px/1.3 var(--sans);color:var(--ink);margin:4px 0 6px}.pj p{margin:0;font-size:14.5px}
.steps{counter-reset:st;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.steps div{counter-increment:st;border-top:3px solid var(--accent);padding-top:12px}
.steps div::before{content:counter(st,decimal-leading-zero);font:700 13px var(--sans);color:var(--accent)}
.steps h3{font:700 18px var(--sans);color:var(--ink);margin:4px 0}.steps p{margin:0;font-size:15px}
.rv{background:var(--card);border-left:4px solid var(--accent);padding:14px 16px;border-radius:0 6px 6px 0}.rv p{margin:0 0 6px;font-style:italic}.rv span{font-size:13px;color:var(--mute)}
details{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:14px 16px;margin:0 0 10px}
details summary{font-weight:700;color:var(--ink);cursor:pointer}details p{margin:10px 0 0}
.links{display:flex;flex-wrap:wrap;gap:8px}.links a{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:8px 14px;text-decoration:none;font-weight:600;font-size:14px}
.cta{background:var(--accent);color:#fff;text-align:center}.cta h2{color:#fff}.cta .btn.o{background:var(--ink)}
footer{background:var(--ink);color:#D9D7EC;padding:36px 0;font-size:14px}footer a{color:#fff}footer .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px}
footer h4{color:#fff;margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.06em}footer ul{list-style:none;padding:0;margin:0}footer li{margin:4px 0}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:30;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)}
.bar a{display:flex;align-items:center;justify-content:center;gap:6px;padding:15px 8px;font-weight:700;text-decoration:none;color:#fff;background:var(--accent)}.bar a+a{background:var(--ink)}
@media (min-width:901px){.bar{display:none}body{padding-bottom:0}}
.crumbs{font-size:13px;color:#B9B6D8;margin:0 0 6px}.crumbs a{color:#B9B6D8}
`;

export function render(p, ctx) {
  const { site, phone, phoneHref, address, all, projectsFor, crmIntake } = ctx;
  const url = site + '/' + p.slug;
  const projs = projectsFor(p.projects);
  const isTown = p.kind === 'town';
  const services = isTown ? p.services.map(sl => all.find(x => x.slug === sl)).filter(Boolean) : [];
  const related = (isTown ? p.near : p.related).map(sl => all.find(x => x.slug === sl)).filter(Boolean);
  const needLabel = isTown ? 'A project in ' + p.town : p.need;
  const faqs = p.faqs || [];

  const ld = [
    { '@context': 'https://schema.org', '@type': 'Service', name: isTown ? 'General contractor in ' + p.town + ', ' + p.state : p.serviceType, serviceType: isTown ? 'General contractor' : p.serviceType,
      url, description: p.desc, provider: { '@id': site + '/#business' },
      ...(p.emergency ? { hoursAvailable: { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' } } : {}),
      areaServed: isTown ? { '@type': 'City', name: p.town + ', ' + p.state } : ['Memphis, TN', 'Bartlett, TN', 'Collierville, TN', 'Cordova, TN', 'Germantown, TN'].map(n => ({ '@type': 'City', name: n })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: site + '/' }, { '@type': 'ListItem', position: 2, name: isTown ? p.town : p.serviceType, item: url }] }
  ];
  if (faqs.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) });

  const bullets = isTown
    ? services.map(sv => `<a class="it" href="/${sv.slug}" style="text-decoration:none"><h3>${esc(sv.serviceType)} in ${esc(p.town)} →</h3><p>${esc(sv.desc)}</p></a>`).join('')
    : p.bullets.map(b => `<div class="it"><h3>${esc(b[0])}</h3><p>${esc(b[1])}</p></div>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#171055">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website"><meta property="og:site_name" content="GrayCo Construction Services">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.desc)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(projs[0] ? cld(projs[0].photo, 1200) : site + '/icon-512.png')}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://res.cloudinary.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,700..800&family=IBM+Plex+Sans:wght@400;600;700&display=swap">
<style>${CSS}</style>
${ld.map(jsonLd).join('\n')}
<script src="/gc-track.js" defer></script>
</head><body data-landing="${esc(p.slug)}" data-town="${esc(isTown ? p.town : '')}" data-service="${esc(isTown ? '' : p.serviceType)}">
<header class="top"><div class="w"><a href="/" aria-label="GrayCo Construction Services home"><img src="/logo.png" alt="GrayCo Construction Services" width="69" height="40"></a>
<nav><a class="hide" href="/services">Services</a><a class="hide" href="/projects">Projects</a><a class="hide" href="#estimate">Free estimate</a><a class="ph" href="tel:${phoneHref}">${esc(phone)}</a></nav></div></header>
<main>
<div class="hero"><div class="w"><div>
<p class="crumbs"><a href="/">Home</a> › ${esc(isTown ? p.town + ', ' + p.state : p.serviceType)}</p>
<div class="kick">${esc(isTown ? 'Licensed general contractor · ' + p.town + ', ' + p.state : p.kicker)}</div>
<h1>${esc(p.h1)}</h1>
<p class="lead">${esc(p.intro)}</p>
<div class="btns"><a class="btn o" href="tel:${phoneHref}">${p.emergency ? 'Call 24/7: ' : 'Call '}${esc(phone)}</a><a class="btn g" href="#estimate">Get a free estimate</a></div>
<ul class="trust">${p.emergency || isTown ? '<li><b>24/7 water emergencies</b></li>' : ''}<li>TN General Contractor #85034</li><li>Licensed in TN, AR &amp; MS</li><li>BBB A+ rating</li><li>IICRC WRT-certified owner</li><li>1-year workmanship warranty in writing</li></ul>
</div>
<form class="form" id="estimate" data-gc-form data-type="${esc(isTown ? 'estimate' : p.type)}" data-need="${esc(needLabel)}" novalidate>
<h2>Free estimate</h2><p class="sm">${p.emergency ? '<b>Water coming in right now? Call — we answer 24/7.</b> ' : ''}We reply within one business day. In a hurry? Call <a href="tel:${phoneHref}">${esc(phone)}</a>.</p>
<label for="f-name">Name</label><input id="f-name" name="name" autocomplete="name" required>
<div class="two"><div><label for="f-phone">Phone</label><input id="f-phone" name="phone" type="tel" autocomplete="tel"></div><div><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email"></div></div>
<label for="f-addr">Address or ZIP</label><input id="f-addr" name="address" autocomplete="street-address"${isTown ? ` placeholder="${esc(p.town)}, ${esc(p.state)}"` : ''}>
<label for="f-msg">What happened / what do you need?</label><textarea id="f-msg" name="message"></textarea>
<label class="hp" aria-hidden="true">Leave empty<input name="website" tabindex="-1" autocomplete="off"></label>
<button class="btn o" type="submit">Send — free estimate</button><p class="msg" role="status" aria-live="polite"></p>
</form></div></div>

<section><div class="w"><h2 class="s">${isTown ? 'What we do in ' + esc(p.town) : 'What we handle'}</h2><div class="grid">${bullets}</div></div></section>

${projs.length ? `<section class="alt"><div class="w"><h2 class="s">${isTown ? 'Recent work in and near ' + esc(p.town) : 'Recent ' + esc(p.serviceType.toLowerCase()) + ' projects'}</h2><div class="grid">${projs.map(x => `<article class="pj"><img src="${esc(cld(x.photo, 640))}" alt="${esc(x.title)}" loading="lazy" width="640" height="422"><div><span class="tag">${esc([x.cat, x.sqft].filter(Boolean).join(' · '))}</span><h3>${esc(x.title)}</h3><p>${esc(x.desc)}</p></div></article>`).join('')}</div><p style="margin-top:18px"><a href="/projects">See all GrayCo projects →</a></p></div></section>` : ''}

${p.steps ? `<section><div class="w"><h2 class="s">How it works</h2><div class="steps">${p.steps.map(st => `<div><h3>${esc(st[0])}</h3><p>${esc(st[1])}</p></div>`).join('')}</div></div></section>` : ''}

<section class="alt" id="reviews" hidden><div class="w"><h2 class="s">What customers say</h2><div class="grid" id="reviews-list"></div></div></section>

${faqs.length ? `<section><div class="w"><h2 class="s">Questions we hear</h2>${faqs.map(f => `<details><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join('')}</div></section>` : ''}

<section class="${faqs.length ? 'alt' : ''}"><div class="w"><h2 class="s">${isTown ? 'Nearby' : 'Related'}</h2><div class="links">${related.map(r => `<a href="/${r.slug}">${esc(r.kind === 'town' ? r.town + ', ' + r.state : r.serviceType)}</a>`).join('')}<a href="/company">About GrayCo</a><a href="/contact">Contact</a></div></div></section>

<section class="cta"><div class="w"><h2 class="s">${isTown ? 'Working on something in ' + esc(p.town) + '?' : 'Talk to a GrayCo project manager today'}</h2><div class="btns" style="justify-content:center"><a class="btn o" href="tel:${phoneHref}">Call ${esc(phone)}</a><a class="btn g" href="#estimate">Get a free estimate</a></div></div></section>
</main>
<footer><div class="w cols">
<div><h4>GrayCo Construction Services</h4><p style="margin:0">${esc(address)}<br><a href="tel:${phoneHref}">${esc(phone)}</a> · <a href="mailto:office@grayco-cs.com">office@grayco-cs.com</a><br>Office: Mon – Fri, 7:00 AM – 5:00 PM<br><b>Water emergencies: 24/7</b><br>Licensed General Contractor in Tennessee (#85034), Arkansas &amp; Mississippi</p></div>
<div><h4>Services</h4><ul>${all.filter(x => x.kind !== 'town').map(x => `<li><a href="/${x.slug}">${esc(x.serviceType)}</a></li>`).join('')}</ul></div>
<div><h4>Areas we serve</h4><ul>${all.filter(x => x.kind === 'town').map(x => `<li><a href="/${x.slug}">${esc(x.town)}, ${esc(x.state)}</a></li>`).join('')}</ul></div>
</div></footer>
<div class="bar"><a href="tel:${phoneHref}">📞 ${p.emergency ? 'Call 24/7' : 'Call now'}</a><a href="#estimate">Free estimate</a></div>
</body></html>
`;
}
