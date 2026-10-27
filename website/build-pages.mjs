// Writes pages/<page>.html — a copy of index.html whose <head> (title, description,
// canonical, og tags) is already right for that page, so Google and Bing see the
// correct page info before any JavaScript runs. netlify.toml serves /company from
// pages/company.html, and so on. Runs on every Netlify deploy; to add a page, add it
// to PAGE_TITLES and PAGE_DESC in index.html and to netlify.toml and sitemap.xml.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const grab = name => {
  const m = html.match(new RegExp('const ' + name + ' = (\\{[\\s\\S]*?\\n?\\});'));
  if (!m) throw new Error(name + ' not found in index.html');
  return Function('return ' + m[1])();
};
const SITE_URL = html.match(/const SITE_URL = '([^']+)'/)[1];
const TITLES = grab('PAGE_TITLES'), DESC = grab('PAGE_DESC');
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const swap = (src, find, val) => {
  const ok = typeof find === 'string' ? src.includes(find) : find.test(src);
  if (!ok) throw new Error('index.html is missing ' + find);
  return src.replace(find, () => val);
};

mkdirSync('pages', { recursive: true });
for (const p of Object.keys(TITLES)) {
  if (p === 'home') continue;
  const title = 'GrayCo Construction Services | ' + TITLES[p];
  const url = SITE_URL + '/' + p;
  let out = html;
  out = swap(out, /<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`);
  out = swap(out, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(DESC[p])}">`);
  out = swap(out, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  out = swap(out, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${attr(title)}">`);
  out = swap(out, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${attr(DESC[p])}">`);
  out = swap(out, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  // Show the right page before the script runs, too.
  out = swap(out, '<div class="page on" data-page="home">', '<div class="page" data-page="home">');
  out = swap(out, `<div class="page" data-page="${p}">`, `<div class="page on" data-page="${p}">`);
  writeFileSync(`pages/${p}.html`, out);
  console.log('wrote pages/' + p + '.html');
}

/* ── landing pages (landing/pages.mjs → l/<slug>.html at /<slug>), the addresses (_redirects) and sitemap.xml ── */
const { SERVICES, TOWNS } = await import('./landing/pages.mjs');
const { render } = await import('./landing/template.mjs');
const dcAt = html.indexOf('const DEFAULT_CONTENT = ') + 'const DEFAULT_CONTENT = '.length;
const CONTENT = (() => { let depth = 0, i = dcAt, inStr = false, q = '';   /* the JSON object literal right after DEFAULT_CONTENT = */
  for (; i < html.length; i++) { const c = html[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === q) inStr = false; continue; }
    if (c === '"') { inStr = true; q = c; continue; }
    if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
  return JSON.parse(html.slice(dcAt, i + 1)); })();
const byTitle = {}; (CONTENT.projects || []).forEach(p => { byTitle[p.title] = p; });
const projectsFor = titles => (titles || []).map(t => {
  const p = byTitle[t]; if (!p) throw new Error('landing/pages.mjs names a project that is not in DEFAULT_CONTENT: ' + t);
  return { title: p.title, cat: p.cat, sqft: p.sqft, desc: p.desc.length > 260 ? p.desc.slice(0, p.desc.lastIndexOf(' ', 250)) + '…' : p.desc, photo: (p.photos || [])[0] || '' };
}).filter(p => p.photo);
const all = SERVICES.map(x => Object.assign({ kind: 'service' }, x)).concat(TOWNS.map(x => Object.assign({ kind: 'town', serviceType: 'General contractor' }, x)));
const slugs = new Set(Object.keys(TITLES));
all.forEach(p => { if (!/^[a-z0-9-]+$/.test(p.slug) || slugs.has(p.slug)) throw new Error('bad or duplicate landing slug: ' + p.slug); slugs.add(p.slug);
  (p.related || p.near || []).concat(p.services || []).forEach(r => { if (!all.some(x => x.slug === r)) throw new Error(p.slug + ' links to unknown page ' + r); }); });
const ctx = { site: SITE_URL, phone: CONTENT.contact.phone, phoneHref: '+1' + CONTENT.contact.phone.replace(/\D/g, ''), address: CONTENT.contact.address, all, projectsFor };
mkdirSync('l', { recursive: true });
for (const p of all) { writeFileSync(`l/${p.slug}.html`, render(p, ctx)); console.log('wrote l/' + p.slug + '.html'); }

/* Netlify reads _redirects before netlify.toml: every landing page at its own address */
writeFileSync('_redirects', '# written by build-pages.mjs on every deploy — edit landing/pages.mjs, not this file\n' +
  all.map(p => `/${p.slug}  /l/${p.slug}.html  200`).join('\n') + '\n');

const today = new Date().toISOString().slice(0, 10);
const PRI = { home: '1.0', services: '0.9', contact: '0.9', projects: '0.8', company: '0.7', careers: '0.5', news: '0.6' };
const urls = Object.keys(TITLES).map(p => [p === 'home' ? '' : p, PRI[p] || '0.6']).concat(all.map(p => [p.slug, p.kind === 'service' ? '0.9' : '0.8']));
writeFileSync('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => `  <url><loc>${SITE_URL}/${u[0]}</loc><lastmod>${today}</lastmod><priority>${u[1]}</priority></url>`).join('\n') + '\n</urlset>\n');
console.log('wrote _redirects and sitemap.xml (' + urls.length + ' addresses)');
