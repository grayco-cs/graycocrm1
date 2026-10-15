# 33.143 hotfix (v1930): stops the pipeline jumping and the lag

`version.txt` = `33.143-2026-10-15-v1930`. Built on 33.143; nothing else changed.

- **Pipeline no longer jumps (11 → 9 → 210).** The old bogus jobs still sitting in the cloud could flash onto the board for a moment every time the CRM synced. They can't reach the screen now, even before the fresh start. (Test: 3 minutes + reload with the bogus cloud data loaded = 0 bad counts; before the fix, 34.)
- **Much less lag.**
  - A loop that rewrote and re-uploaded about 2 MB of estimates **every 1.5 seconds** is fixed. On a phone that was 135 MB uploaded in 90 seconds; now 0. Background work dropped from about 5 seconds per minute to about 0.3 seconds.
  - Clicking a button or changing tabs no longer re-downloads everything; it only fetches what changed (a full refresh at most every 10 minutes).
  - Taps on phones no longer scan the whole page (that cost 0.5–1.2 s per tap).
- Tests: pop-up 7/7, sign-in pop-ups pass, security 158/158.

The fresh start (`docs/SETUP-CHECKLIST.md` Part E) is still recommended for housekeeping, after the next full update.
