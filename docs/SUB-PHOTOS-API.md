# GrayCo Photos for the sub portal and the customer portal (patch U2)

Owner, 10/20: "make sure the sub portal also links our GrayCo Photos app and all photos so the sub can see."
Also: "Open in CompanyCam" becomes "Open in GrayCo Photos". Customers and subs see only THEIR job.

There are two read-only, link-code-scoped photo APIs:

| who | function | code goes in | jobs |
| --- | --- | --- | --- |
| subcontractor | `/.netlify/functions/sub-photos` (new) | header `x-sub-token` | the jobs the sub is on |
| customer | `/.netlify/functions/portal` `{action:'photos'}` (changed) | header `x-portal-token` | the one job of the link |

Neither one ever returns a CompanyCam link, a note, a comment, a chat message, a staff name or e-mail, or
another job's photo. GrayCo pictures come from the private bucket `crm-files` as **signed links that expire
after 1 hour** (`expiresIn: 3600`). The page should ask again when it is left open longer.

## Who sees which photo

Every photo in GrayCo Photos has two switches on its photo screen (staff only):

| field on the record (`gc_kv` "gc_photos") | button | customer portal | sub portal |
| --- | --- | --- | --- |
| `shared` | **Customer sees it** / **Hidden from customer** | shown when `shared === true`, or when it is not set and the tag is not Damage | — |
| `hideSubs` | **Subs see it** / **Hidden from subs** | — | `true` hides, `false` shows, **not set = the same as the customer** |

So:
- An **Internal only** photo (customer off, subs not set), including a Damage photo nobody turned on, is never
  shown to a customer or a sub.
- A **customer-only** photo (customer on, subs off) is never shown to a sub.
- **Deleted** photos, the CompanyCam flag records and photos of other jobs are never shown.
- CompanyCam photos of the job are shown to both unless someone hid that photo. The flag record
  `{id:'ccf_<CompanyCam photo id>', source:'ccflag', ccId, shared, hideSubs}` in `gc_photos` holds that choice.
  Their pictures are CompanyCam's own image addresses (img.companycam.com). There is no CompanyCam project link.

## Sub portal: `POST /.netlify/functions/sub-photos`

Request: `Content-Type: application/json`, header `x-sub-token: <link code>` (32–64 chars `[A-Za-z0-9_-]`).
Never put the code in the URL. CORS allows `SUB_PORTAL_ORIGIN` (default `https://portal.grayco-cs.com`, a comma list)
and the CRM's own origins.

### Who the code belongs to

The code is looked up in table `gc_sub_portal` (created by `docs/grayco-photos-setup.sql`: RLS on, no policies,
service_role only):

| column | meaning |
| --- | --- |
| `token` | the link code |
| `sub_id` | the sub's id in the CRM: `vendors[].id`, which is `projects[].subs[].vendorId` |
| `sub_name`, `sub_email` | also used to match the job's subs list |
| `job_ids` | extra jobs this code may see, besides the matched ones |
| `revoked`, `expires_at` | a code that is turned off or past its expiry is not active |

The sub portal agent creates and turns off these rows from its own staff screen, with the service key.
If the sub portal keeps its codes somewhere else, it validates the code itself and calls the same code
in-process (see **From another function** below). In that case nothing here needs the table.

**A job the sub is on** means one of these:
- The job is live (not deleted or lost) and its `subs` list has an entry that matches the sub by `id`, `vendorId` or
  `subId` = `sub_id`, or by e-mail, or by name. The entry must not have a status of removed, declined, cancelled,
  fired, terminated, replaced, lost or rejected.
- Or the job id is in `job_ids`.

### Actions

`{action:'jobs'}` returns:

```json
{ "ok": true, "jobs": [ { "id": "PRJ1", "name": "Smith Roof", "address": "12 Oak St" } ] }
```

`{action:'photos', jobId:'PRJ1'}` returns:

```json
{ "ok": true, "job": { "id": "PRJ1", "name": "Smith Roof", "address": "12 Oak St" }, "expiresIn": 3600,
  "photos": [ { "id": "ph_…", "t": "<signed thumbnail url>", "f": "<signed full url>", "at": "2026-10-20",
                "tag": "Before|During|Damage|After|Punch|", "src": "grayco|sub|companycam", "mine": true } ] }
```

- The list is newest first, one entry per picture. The marked-up copy is used when there is one.
- `mine` is only on the sub's own uploads.
- At most 400 GrayCo photos are returned, plus the CompanyCam ones.

`{action:'upload', jobId, name, data, tag?, note?}` adds a photo the sub took to that job's GrayCo Photos:
- `data` is the picture as base64 (a `data:` prefix is fine): JPEG, PNG, WebP or HEIC, up to 4.5 MB after decoding.
  Shrink it in the browser first, for example to 1600 px at JPEG 0.72.
- `tag` is one of the five tags. The default is During.
- `note` is up to 300 characters.

It returns `{ok:true, id, tag}`, or `{ok:true, id, duplicate:true}` when the same picture is already on that job.

The server stores the picture in `crm-files` under its SHA-256 name and adds this record to `gc_photos`:
`{source:'sub', by:'<sub name> (sub)', byKey:'sub:<sub_id>', subId, subName, shared:false, hideSubs:false, …}`.
- In GrayCo Photos it shows with a **SUB** badge and the sub's name.
- Subs on that job see it.
- The customer does **not** see it until staff press **Customer sees it**.
- The server checks a moment later that the record is still in the list, because a CRM device may have written
  `gc_photos` at the same time. If it is not, the server adds it again (up to 3 tries).

### Errors

| status | body | when |
| --- | --- | --- |
| 404 | `{ok:false, error:"This link is not active — call GrayCo 901-585-0944"}` | the code is unknown, malformed, turned off or expired; always the same answer, about 250 ms |
| 404 | `{ok:false, error:"This job is not on your list."}` | the job is not one of the sub's |
| 400 | `Bad request` / `Which job? (jobId)` | bad JSON, an unknown action, or a bad job id |
| 413 / 415 | — | upload too big / not a photo |
| 429 | — | too many tries from one address: 240 requests per 10 minutes (an upload counts 4), or 8 bad codes |
| 503 | `{setup:true}` | `gc_sub_portal` does not exist yet: run `docs/grayco-photos-setup.sql` |

### From another function (no HTTP)

```js
const sp = require('./sub-photos')._core;           // netlify/functions/sub-photos.js
const sub = { id: 'V12', name: 'ABC Roofing', email: 'abc@x.com', jobIds: [] };   // already validated by you
await sp.jobsForSub(sub);                            // { ok, jobs }
await sp.photosForSub(sub, jobId);                   // { ok, job, photos, expiresIn } | { ok:false, status, error }
await sp.uploadForSub(sub, jobId, { data: base64, name, tag, note });   // or { buffer, ... }
```

Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (already set), `COMPANYCAM_TOKEN` (optional; already set), optional
`SUB_PORTAL_ORIGIN` and `SUB_PORTAL_TABLE`.

### Linking to GrayCo Photos from the sub portal

The sub portal shows these photos itself, in a "GrayCo Photos" gallery for the job. It must not link to the CRM's
`/?app=photos`, because that needs a staff sign-in. Its own upload button calls `action:'upload'`.

## Customer portal: `POST /.netlify/functions/portal` `{action:'photos'}` (changed)

Request: header `x-portal-token: <customer link code>`, as for `{action:'view'}`.

The response is that link's one job only:

```json
{ "ok": true, "expiresIn": 3600,
  "photos": [ { "id": "ph_…", "t": "<signed thumb>", "f": "<signed full>", "at": "2026-10-20", "tag": "After", "src": "grayco" },
              { "id": "cc_123", "t": "https://img.companycam.com/…", "f": "…", "at": "2026-10-19", "src": "companycam" } ] }
```

- The old `url` (a CompanyCam project link) is gone, and `view.companyCam.url` is always `''`.
- `portal.html` now shows **"See your job photos — GrayCo Photos of your job"** and a read-only gallery. There is no
  "Open in CompanyCam" button.
- An unknown or turned-off code gets the same "not active" answer as before.

## Tests

`test_U2_api.mjs`. Run it with `node test_U2_api.mjs <build>/netlify/functions`. It checks:
- the sub gets only the jobs it is on;
- Internal-only, customer-only and Hidden-from-subs photos are hidden from subs;
- CompanyCam flags are honoured;
- links are signed and expire;
- uploads are tagged with the sub;
- a bad, turned-off or expired code gets "not active";
- the customer sees only its job's photos;
- the internal flag hides a photo from the customer;
- there is no CompanyCam link.
