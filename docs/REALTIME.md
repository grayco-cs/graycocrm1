# Field ↔ desk, right away (33.144, patch N)

**What changed.** When someone saves something on a phone or a computer (a job's progress, an expense
receipt, an office to-do, an approval), it goes up to the company database within about a second.
Every other signed-in computer and phone hears about it on Supabase's live feed and puts it on screen
within a second or two.

**One step on Supabase:** run `docs/realtime-setup.sql` once (SQL Editor). It adds the `gc_kv` table to
the live feed. Until you do, nothing breaks: the CRM notices that its own saves don't come back on the
feed and keeps using the timed sync as before (`_gcLiveStatus()` in the console shows `healthy: false`).

**What it never does**
- It never moves the screen. On a desk computer, changes from others are drawn when the screen-hold
  allows it: nothing open, no words typed and not saved, 25 s after the last click or keystroke. In the
  field app (whose screens are drawn over the desk) changes go in straight away unless a box is being
  typed in.
- It never replaces a list. A push is a union with what the cloud has; a record edited on two devices
  goes to the newest edit (each real edit is stamped `updatedAt` when it is written); a record deleted
  by a person stays deleted (tombstones).
- Lists the accounting engines work out for themselves (`gcAcctRegister`, `gc_folded`) are received,
  never pushed from here.

**Console:** `_gcLiveStatus()` — feed state, pushes, events, own echoes, average time to screen.
