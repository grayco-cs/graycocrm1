# Customer selections (patch SEL)

Owner, 21 Oct 2026: *"I want everyone in the company able to add products to that database, prices too, and always keep
the most updated price. I do want customers picking inside the portal if possible, but the PM can pick too, and always
require customer signature for PM-selected materials. If the customer picks in the portal, that is their choice."*

## The product library (CRM → Products → 🎨 Product library, or a job's Customer portal card → 📚)

- **Everyone adds and edits** (owner, admin, office, PM, estimator): category (roofs first — shingles, metal, underlayment,
  drip edge, vents — then siding, gutters, windows, paint, flooring, other), brand, line, color / name, unit, price,
  notes and a photo. **➕ Add a product** has every field; it is saved to the cloud (gc_kv `selectionLibrary`) at once.
- **Newest price wins.** A price change records the old price with who and when (*Price history* in ✎). The price has its
  own stamp (`priceAt`), so a computer that saves something else later from an older copy never brings an old price back.
- **One product per brand + line + color.** Adding it again offers to update its price instead (the old price goes to history).
- **Search** and a **category filter**. **Remove** is admin-only and sticks for everyone (a tombstone).

## Selections on a job (job → Customer portal card → 🎨 Customer selections)

1. The PM adds a selection from the library and ticks the options the customer may choose from.
2. **The customer picks in the portal** (Home → *Your selections*: photos, names, prices). They tap one, type their name
   and confirm — that is their choice and their signature. Name, time and address (IP) are recorded; a signed copy (PDF)
   goes to the job's documents and to the customer by e-mail; the PM gets an e-mail and the office a to-do; the job shows
   *✓ Customer chose …*.
3. **Or the PM picks for them.** The job shows **⚠️ Waiting on customer signature**; the portal shows *Please review and
   sign* (typed name + drawn signature, or tap Sign with the typed name). The e-mail asking them to sign waits on
   **✅ Approvals** for the job's PM (kind `selection_sign`). When they sign: *✓ Signed by …*, the signed copy is in the
   job's documents and the customer gets their copy at once.
4. **Locked:** changing a signed or customer-chosen selection asks first and needs a new signature.

## How it works

- `netlify/functions/selections.js` — public `view` / `pick` / `sign` (the customer's portal link code; every input checked
  on the server; a job only ever sees its own selections; carrier names never shown) and staff `request-sign`.
- What customers do is kept in gc_kv `selectionResponses` (written only by the function); the CRM reads it.
- The signed copy is a PDF in the private `crm-files` bucket (SHA-256 name), listed in the job's documents
  (`seldoc_…`, shared to the portal).
- Nothing new to set up: it uses the portal's settings (SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY).
- Console: `_gcSEL.status()`, `_gcSEL.state(jobId)`, `_gcCH.status()`.
