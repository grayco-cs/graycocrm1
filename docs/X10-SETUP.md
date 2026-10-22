# Patch X10: on call, home profile, testimonials, My data, statements, vehicles, goal, access codes, inspections, sub availability

Nothing new is needed on Netlify. Optional settings:
- `ONCALL_SECRET` signs the on-call ✅ Accept links. Without it, a secret is derived from the Supabase service key.
- `ONCALL_OFF=1` stops on-call paging.
- `X10_OFF=1` stops the 2-minute job.
- Texts go out once `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` are set.

## 📟 On call (💧 Mitigation tab → 📟 On call, or ⚙ Admin)

### The rotation
1. Add the mitigation techs / PMs in order.
2. The rotation turns every Monday (Central time).
3. Business hours default to 7:00–18:00 on weekdays. Weekends and listed holidays count as after hours.
4. Only an admin, or someone with the **mitigation** profile, can change it.

### How a page works
- **What triggers a page:** any intake (website, leads@, partner API, missed call, bids@ inbox) that brings an **after-hours emergency**. Emergency means water, flood, burst pipe, sewage, active leak, fire or smoke damage, mitigation, or "emergency".
- **First page:** this week's person gets an e-mail with their own ✅ Accept link, a phone push, and a text once Twilio is set up.
- **Escalation:** if nobody accepts in 10 minutes (adjustable from 5 to 60), the next person on the rotation is paged. After the last person, every admin is paged.
- **On the lead:** the accept is logged, and the Lead Pipeline shows a 📟 chip.
- **Storage:** stored in the service-only table, in `gc_x10_oncall` and `gc_x10_pages`.

## 🏠 Home profile and 💬 testimonials (customer portal)

### 🏠 My home
- **Where it shows:** on the portal's Home tab.
- **What it covers:** the materials and colors used, warranties, photos, invoices, the maintenance plan and the service history.
- **Where the data comes from:** filled automatically from the selections and the job. The PM can add to or correct it from the job → 🏠 Home profile.
- **What it never shows:** sub prices, internal notes or the carrier.

### 💬 "Share a few words?"
- **When it is asked:** at closeout, at the same time as the review request (the Final invoice stage).
- **What the customer can send:** a few words, with an optional video up to 4 MB, and a permission box.
- **Where it goes:** to 📣 Marketing → 💬 Testimonials, and the Office To-Do gets a note to review it.
- **Approval:** a testimonial can only be approved for use when the customer gave permission. Nothing is posted automatically.

## 📊 My data (My Profile)

- **What each person sees:** only their own jobs, billed and collected amounts, commission (earned / paid / pending, from the CRM's commission rules), leads and close rate, approvals waiting, and their vehicle and gas.
- **Admins:** can pick anyone.
- **Monthly e-mail:** on the 1st, each person gets their own numbers. The commission figures come from the last time their My data, or an admin's view of it, was open.

## 💵 Monthly customer statements

On the 1st at 8 AM Central:
1. Each customer with an open balance gets one statement covering all their jobs.
2. The statement goes to ✅ Approvals: PM first, then an admin.
3. Once approved, it is sent from billing@ with a portal link.
4. Balances over 60 days (or with no e-mail on file) create an Office To-Do to call.

## 🚚 Vehicles & gas (⚙ Admin)

- **What is tracked:** trucks, gas cards and allowances, each with a driver.
- **What drivers log:** miles, oil changes and gas, from 📊 My data.
- **Daily reminders at 7 AM:** oil or service due, and registration or insurance expiring within 30 days. These go to the Office To-Do and to the driver.

## 🎯 Company goal (⚙ Admin)

- **Setting:** the yearly revenue goal, counted as money collected or money billed.
- **Pace:** shows whether the company is ahead or behind, the % of goal, and what is needed per month.
- **Where it shows:** in Admin and as a bar on the 📺 TV scoreboard.

## 🔐 Access codes (job → 🔐 Access codes)

- **Where codes are kept:** lockbox, gate and door codes are kept in the service-only table (`gc_x10_codes`), never in the job data.
- **Who sees them in the CRM:** only the job's PM, APM, superintendent and admins.
- **How they are shown:** one at a time, and every reveal is logged.
- **Subs:** see codes in the sub portal only on the days they are scheduled on that job, and those views are logged too.
- **Closed jobs:** codes are wiped automatically.
- **Never shown in:** e-mails or the customer portal.

## 📋 Inspections (job → 📋 Inspections, desk and field view)

- **Cities:** Bartlett, Memphis / Shelby County, Germantown, Collierville, Arlington, Lakeland, Millington and Southaven / DeSoto County.
- **Editing:** ⚙ Admin → 📋 templates, to change the steps and the job types that need a permit.
- **Checklists only:** these are GrayCo's checklists. Always check the city's current requirements.
- **On each step:** tick it and record the date, pass/fail and notes.
- **A fail:** creates a punch item and an Office To-Do to reschedule.
- **"Not needed":** can be set per job.

## 🗓 Sub availability

- **In the sub portal (English / Español):** subs see their 8-week calendar and mark busy days.
- **In the CRM:** a sub booked on a busy day, or on two jobs the same day, gets a warning. Bookings are never blocked.
- **Where to look:** ⚙ Admin → 🗓 Sub availability lists them.
