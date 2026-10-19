# GrayCo CRM 33.146: RoofScout tab

`version.txt` = `33.146-2026-10-19-v1`. Built on 33.145.

## New
- **🏠 RoofScout** in the CRM menu, right under Leads. It opens RoofScout inside the CRM, already signed in, because it's the same GrayCo sign-in. Everyone with a CRM sign-in sees it (every role).
- You can also find it with the menu search ("roofscout", "roof leads", "scan").
- RoofScout keeps its own address too: **https://roofscout.grayco-cs.com** (see `docs/ROOFSCOUT-SETUP.md`).
- Inside the CRM, RoofScout hides its own logo and Sign out button; sign out from the CRM as usual.

## What else changed
Nothing. The only changes to `index.html` are the menu entry, the role lists, the tab list for alerts, the menu search entry, the page itself, and the build number.

## Tests on this build
- Every changed script block passes a JavaScript syntax check (6 blocks, same as before).
- The CRM was loaded in a browser with a stand-in database and Wesley signed in. The menu shows RoofScout; clicking it opens RoofScout signed in as Wesley, without a second sign-in and without page errors.

## Right after it goes live
Open CRM tabs show the update bar. Click it, or reload with **Ctrl+F5**.

RoofScout needs `docs/roofscout-setup.sql` run once in Supabase before it can load leads (see `docs/ROOFSCOUT-SETUP.md`).
