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
