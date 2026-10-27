# Getting grayco-cs.com into Google and Bing

The site is already set up for search engines. These steps are the part only someone at GrayCo can do,
because they need a login. Allow about 30 minutes in total.

## What's already done in the site

- **Every page has its own address**, like grayco-cs.com/services and grayco-cs.com/contact. Before, all
  pages were `#/services`, and Google treats everything after `#` as the same page, so only the home
  page could ever show up in search. Old `#/...` links still work and switch to the new addresses.
- **Each page has its own title and description.** `build-pages.mjs` writes them into the page files
  on every deploy, so Bing sees them too. Bing doesn't reliably run JavaScript.
- `sitemap.xml` lists all 7 pages, and `robots.txt` points to it.
- **Business details for Google's local results.** The page head lists GrayCo as a GeneralContractor
  (structured data) with the address, phone, hours and service area, so Google can show them.
- Favicon, app icon, link-preview tags for Facebook and texts, and a proper 404 page.

## 1. Deploy first

Deploy with `netlify deploy --prod`, as in the README. Then check that these load:
https://grayco-cs.com/sitemap.xml , https://grayco-cs.com/robots.txt , https://grayco-cs.com/services

If the site's main address is **www**.grayco-cs.com rather than grayco-cs.com, replace
`https://grayco-cs.com` with the www version in: `index.html` (canonical, og:url, the structured
data, and `SITE_URL`), `sitemap.xml` and `robots.txt`.

## 2. Google Search Console

1. Go to https://search.google.com/search-console and sign in with the Google account that owns
   GrayCo's Google Business Profile, so everything stays under one account.
2. **Add property** → choose **Domain** → enter `grayco-cs.com`.
3. Google shows a TXT record (`google-site-verification=...`). Add it at your domain's DNS host
   (wherever grayco-cs.com's DNS is managed, which may be Netlify DNS) and click **Verify**. DNS
   verification covers www, the bare domain, and http and https in one step, so the site needs no code.
4. Left menu: **Sitemaps** → enter `sitemap.xml` → **Submit**. The status should say *Success* and 7 pages.
5. Left menu: **URL inspection** → paste `https://grayco-cs.com/` → **Request indexing**. Do the same for
   `/services` and `/contact`. Google allows about 10 of these requests a day.
6. Pages usually show up in Google within a few days to 2 weeks. Check **Pages** in Search Console for progress.

## 3. Bing Webmaster Tools (also covers DuckDuckGo and Yahoo, which use Bing's results)

1. Go to https://www.bing.com/webmasters and sign in. A Google account works.
2. Choose **Import from Google Search Console**. It copies the verified site and the sitemap in one click,
   so you don't need a code or a DNS record. Do step 2 first.
3. Afterwards open **Sitemaps** and confirm that `https://grayco-cs.com/sitemap.xml` is listed. If it isn't,
   click **Submit sitemap**.
4. Optional: **URL Submission** → paste the 7 page addresses to get them crawled sooner.

If the import doesn't work, add the site manually and choose the **HTML Meta Tag** option. Paste the code
into the commented `msvalidate.01` line near the top of `index.html`, remove the comment marks, and redeploy.

## 4. Google Business Profile (matters more than anything above for local searches)

Searches like "general contractor Bartlett TN" or "water damage Memphis" show the map results first.
Those come from the Business Profile, not from the website.

- At https://business.google.com make sure the name, address (4007 Broadway Road, Bartlett), phone
  (901-585-0944) and hours match the website exactly.
- Website field: `https://grayco-cs.com/`. Category: **General contractor**. Add secondary categories:
  Water damage restoration service, Fire damage restoration service, Commercial contractor, Remodeler.
- Service areas: Memphis, Bartlett, Cordova, Collierville, Germantown, Arlington, Lakeland, plus any
  other areas you serve in Arkansas and Mississippi.
- Add photos every month and ask every finished customer for a Google review. Reviews are the biggest
  factor in where you rank on the map.

## 5. Ongoing

- When you add a page to the site, add it to `PAGE_TITLES` and `PAGE_DESC` in `index.html`, to
  `netlify.toml` and to `sitemap.xml`, then resubmit the sitemap in both tools.
- Connect Search Console to Google Analytics (Analytics → Admin → Search Console links) to see which
  searches bring people to the site.
