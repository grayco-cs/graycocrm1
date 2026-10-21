# Supplier orders into the CRM (orders@) — patch AUTO7

Supplier order confirmations (ABC Supply, SRS, Beacon, Home Depot, Lowe's, 84 Lumber, …) keep going to **office@**.
A Google Workspace routing rule **also** delivers a copy to **orders@in.grayco-cs.com** — the same Resend receiving
domain and webhook as bids@ (`bid-inbox.js`). The CRM reads each one (supplier, order #, PO / job reference, delivery
date, items), matches it to the job (the job's PO first, then its street address, then its name) and:

- puts the delivery on the job's **schedule** ("🚚 Delivery — ABC Supply #…") and in the **Site Book** (Deliveries today);
- lists it in the superintendent's **7 AM dispatch** that day;
- shows the customer **"Materials arriving <day>"** in the portal (the day only — never the supplier, prices or papers).

An order it cannot match waits on the **Office To-Do** ("🚚 Supplier order to put on a job") with a job picker.

**Before this works:** Resend → Domains → `in.grayco-cs.com` must say **Verified** (the same as for bids@).

## The Google rule (Wesley, once) — "Content compliance", because it can look at the sender

1. **admin.google.com** → **Apps** → **Google Workspace** → **Gmail** → **Compliance** → **Content compliance** → **Configure** (or **Add another rule**).
2. **Description:** `Supplier orders copy to CRM`.
3. **1. Email messages to affect:** ✔ **Inbound**.
4. **2. Add expressions that describe the content you want to search for:** **If ANY of the following match** → **Add**:
   - **Advanced content match** → Location **Sender header** → **Matches regex** →
     ```
     (?i)@(abcsupply\.com|srsdistribution\.com|becn\.com|beaconroofing\.com|homedepot\.com|lowes\.com|84lumber\.com|gulfeagle\.com|ferguson\.com)
     ```
   - **Add** again → **Advanced content match** → Location **Subject** → **Matches regex** → `(?i)order confirmation|delivery (date|confirmation)|ready for pick ?up`
5. **3. If the above expressions match, do the following:** **Modify message** → **Also deliver to** → ✔ **Add more recipients** → **Add** → `orders@in.grayco-cs.com` → **Save**.
6. **Show options** → **Envelope filter** → ✔ **Only affect specific envelope recipients** → **Single recipient** → `office@grayco-cs.com`.
7. **Save**. Mail to office@ still lands in office@ exactly as before — the CRM just gets a copy.

Anyone can also **forward** an order confirmation to `orders@in.grayco-cs.com` by hand.

**Tip for PMs:** put the job's **PO** (e.g. GC-1042) on every order — it is the surest match.

Optional Netlify setting: `ORDER_INBOX_TO` (default `orders@in.grayco-cs.com,orders@grayco-cs.com`).
Check: `https://crm.grayco-cs.com/.netlify/functions/bid-inbox?ping=1` shows `ordersTo`.
