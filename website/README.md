# GrayCo Construction Services — website

A single-file site. Everything (markup, CSS, JS, content, logo) lives in `index.html`.
No build step, no framework, no node_modules needed to view it — open the file in a browser.

## Files

- `index.html` — the entire site
- `netlify/functions/` — small backend that saves admin edits and uploaded photos
  - `_auth.mjs` — password check shared by the other functions
  - `get-content.mjs` / `save-content.mjs` — read + write site content
  - `upload-media.mjs` / `media.mjs` — store + serve uploaded photos
- `netlify.toml`, `package.json` — Netlify config (functions need `@netlify/blobs`; page addresses)
- `build-pages.mjs` — runs on deploy; writes `pages/<page>.html` so each page has its own title,
  description and canonical before JavaScript runs (search engines need this)
- `sitemap.xml`, `robots.txt`, `404.html`, `logo.png`, icons — search engines and browsers
- `SEO-SETUP.md` — **how to get the site into Google Search Console and Bing Webmaster Tools**

## How index.html is organized

Read it in this order — it's long but regular:

1. `<style>` — all CSS. Design tokens are at the top in `:root` (`--paper`, `--ink`
   navy, `--accent` orange, type stacks). Sections below are commented by name
   (NAV, HERO, THREE PANELS, NEWS, COMPANY, SERVICES, PROJECTS, REVIEWS, CAREERS,
   FOOTER, PAGES, MOTION, ADMIN).
2. `<head>` — title, description, canonical, link-preview tags and the business structured data
   (address, phone, hours, service area). Keep these in step with the Contact section.
3. Markup — one `<div class="page" data-page="...">` per page: home, company,
   services, projects, news, careers, contact. Most are empty shells; content is
   rendered by JS.
4. `<script>`:
   - `DEFAULT_CONTENT` — all site copy, projects, team, photos as one JSON object
   - `render()` — draws every section from `CONTENT`
   - router — real addresses (`/services`); `go()` / `showPage()` / `currentPage()`; old `#/services` links still work
   - storage — loads saved content from the Netlify function, falls back to defaults
   - `SCHEMA` + editor — drives the admin panel; add a field here and it appears
   - analytics — reads `CONTENT.footer.ga`

**To change text or photos, don't edit the markup — edit `DEFAULT_CONTENT`**, or use
the in-page editor. The markup is just scaffolding.

## Editing from the website itself

Gear button, bottom-right → sign in → edit any section → "Save & publish".

Who can sign in (Netlify → Site configuration → Environment variables, then redeploy):
- `ADMIN_PASSWORD` — **required**. Until it is set, nobody can save (there is no built-in password any more).
- Anyone with an `@grayco-cs.com` address, plus the addresses in `ADMIN_EMAILS`
  (comma list — e.g. the marketing agency: `malcolm@adventuresmedia.com`). Remove an address to lock them out.

## Google Analytics

Create a GA4 property at analytics.google.com, copy the Measurement ID
(`G-XXXXXXXXXX`), then in the editor: Footer, Google & social links → Google
Analytics Measurement ID. Nothing loads until an ID is set.

It records a page view on every page change. The pages switch without reloading, so GA
wouldn't see the changes on its own. See `initAnalytics()` and `trackPage()`.

## Google & Bing search

See `SEO-SETUP.md`.

## Deploying

This folder lives in the CRM's GitHub repo (`grayco-cs/graycocrm1`, folder `website/`). Best setup — every
change pushed to `main` goes live by itself:

1. Netlify → the grayco-cs.com site → Site configuration → Build & deploy → Link repository → `grayco-cs/graycocrm1`.
2. **Base directory: `website`** · Build command: (leave empty — `netlify.toml` here sets it) · Publish: `website`.
3. Branch: `main`. Save, then Deploys → Trigger deploy.

By hand instead: `cd website && npm install && netlify link && netlify deploy --prod`.
Drag-and-drop deploy won't work — it skips the build (page copies) and `npm install` (the save/upload functions).

## Contact form → CRM

The form sends to the CRM (`crm.grayco-cs.com/.netlify/functions/website-intake`): each message becomes a lead in
the CRM's 📥 Lead Inbox with where the visitor came from (Google Ads click, Google search, Facebook, a tracked
`/go/` link …). If the CRM can't be reached, the same form goes to Netlify Forms instead, so nothing is lost.
See `sendMail()` and `captureAttribution()` in `index.html`.

## Known notes

- Project photos are hosted on Cloudinary (cloud name `dzewujlvg`). They load on
  the deployed site; they do not load in a sandboxed preview.
- The site logo is embedded as base64 PNGs in the CSS — that's why the file is large.
- There is a separate, older React/Vite version of this site in the
  `grayco-cs/grayco-website` GitHub repo. This file is not that project.
