# FASTOPEN — opening the CRM fast on the owner's iPhone

Owner, 11/19: "Took a long time to open up too." Then: "I don't want it lagging a bunch right when I open it. I'd rather
have a loading-data screen than that, but I'd rather have neither, just open right away … if I have to have lags, then do a
loading screen on the initial sign-up when downloading the CRM, nowhere else."

Targets that follow from that:
1. A normal open (installed / cached) shows Field home at once and stays smooth: no long task over 50–100 ms in the
   first ~10 s after the first paint; taps answer at once.
2. A blocking "Loading your data…" screen (with progress) only on the very first open of a device / after sign-in.
3. After an update: the cached old build opens at once; the new one is taken quietly or at the next idle moment.

Everything below was measured OFFLINE (tools/qa harness, real-data snapshot of 11/19 05:08Z loaded into the fake cloud,
nothing written live), owner-iPhone profile: 390×844, 400 kbps down / 150 up, 300 ms RTT, CPU ×3, localStorage nearly
full. The build machine was shared with other test runs (load 3–7 on 4 cores), so single numbers vary ±40 %; compare
runs made side by side. Scripts: the session scratchpad `fastopen/` (measure.mjs, analyze.py, incl.py, tasks.py, summ.py).


## 1. Where the time goes (baseline: claude/rcbatch 26b6269, build 33.277-…-r36q)

Baseline, owner-iPhone profile, three warm opens and one cold open made back to back (ab_base3 / base2):

| | warm open (page cached, signed in) | cold open (first after a release) |
|---|---|---|
| index.html | 304 revalidation, 0.9–1.1 s | 200, 6.1 MB brotli, arrives at 130 s |
| Field home (`#_gcJobPick` with its rows) | 25.3 / 27.3 / 27.6 s (17.4 s on a quieter machine) | 149.8 s |
| time to interactive (last long task followed by 5 s quiet) | 38–39 s | 164 s |
| long tasks in the 10 s after Field home | 11–29 tasks, 4.9–9.6 s in all, worst 0.8–6.9 s | 21 tasks, 3.5 s, worst 1.1 s |
| downloaded | 1.2–1.4 MB, ~220 gc_kv requests, 16 MB JSON | 7.4 MB |
| the sync's first pull | 52 lists' values, 12.6 MB JSON / 0.81 MB wire, ends at ~26–27 s | the same |
| DOMContentLoaded | 22–24 s (10–20 s after Field home on a loaded machine) | 157 s |


What gates each part (traced warm open, CPU ×3; trace overhead makes it ~2× slower, proportions hold):

* **Network.** Warm: index.html is revalidated (no-cache → 304, ~1.1 s on 300 ms RTT; up to 5.6 s when the link is busy).
  Cold (first open after a release): the 6.1 MB brotli page arrives at **~131 s**; nothing shows before it.
  JS/CSS/CDN: React/ReactDOM (CDN, 138 KB), supabase-js (214 KB), envcomp-core/legal2/epahud-core/sub-match: all revalidated, small.
* **The sync pull.** `_lastPull` is in memory only, so the first pull of every open asks for the values of all 52 synced
  lists: one request, **12.6 MB of JSON (0.81 MB on the wire)**, on the link from ~9 s to ~26 s (it delays every other
  download > 16 KB behind it). Biggest: `__est__gc_ests_v2` 3.0 MB, `gc_folded` 3.0 MB, `estimates` 2.3 MB,
  `__est__gc_matlog_v2` 0.9 MB, `leads` 0.7 MB, `projectDocs` 0.7 MB, `projects` 0.56 MB, `gcAcctRegister` 0.33 MB,
  `invs` 0.27 MB, `__est__gc_rates_v3` 0.18 MB, `gc_tombstones` 0.15 MB, the rest < 0.1 MB each. Then JSON parse, the
  tombstone filter, union merges, `idbSet` of each list and a React re-render: a 1–7 s burst of long tasks right after
  Field home. Besides that pull a warm open makes ~270 other gc_kv requests (≈ 170 single-key reads by patches; the
  largest: `gc_office_tasks` 3 reads / 2.1 MB raw, `leads` 0.7 MB, `gc_tombstones` 2 × 0.15 MB, `gc_leads_deleted` 0.26 MB,
  `gc_sub_approvals` 2 × 0.07 MB, `gc_bidmerge_log` 0.12 MB) — 40 MB raw JSON per warm open in all.
* **HTML parse / compile / execute.** Top-level evaluation of all 947 inline scripts is cheap (≈0.9 s; V8 compiles
  lazily; tokenising the 24 MB is ≈2.8 s). The real cost is that the **parser is starved**: blocks 0–640 (line 135 k)
  are reached by ~10 s, but blocks 640–946 take another ~40 s (traced), because the timers, promise chains and DOM scans
  that the earlier blocks start run between parser slices. **Field home cannot appear before the parser reaches
  `gc-patch-pmfield` (block 824, line 213 k of 250 k)**: in the trace it was evaluated at 39.1 s and Field home showed at
  40.0 s. DOMContentLoaded comes 10–20 s after Field home.
* **Main thread before Field home (traced, inclusive by outermost patch, wrappers PERFCLICK/GOVERNOR/J excluded):**
  React app bundle (block 65) 1.9 s, "THE LAG, FOUND" (60) 1.7 s, "NEVER ALLOW DUPLICATES" (607) 1.65 s, "JOBS STAY PUT"
  (681) 1.2 s, files-in-storage (36) 0.8 s, PHONEUI 0.75 s, TOMBFIX 0.7 s, register de-dupe (598) 0.6 s, AP3 0.6 s,
  NAV 0.5 s, sign-in (27) 0.45 s, ROLEAPPS 0.4 s, the sync (151) 0.4 s, LA, TODOPERF, AP2 ≈0.3 s each; localStorage
  `getItem` 0.7 s (5 MB store), IndexedDB result reads 0.3 s, GC 1.0 s.
* **The 10 s after Field home:** the main thread is busy 100 % (10.0 s sampled of 10 s): ROLEAPPS 0.75 s, AP3, NAV, 614,
  "THE LAG" ≈0.35–0.4 s each, 564, MULTICO-UI, 61, 681, PHONEUI, APX, … — DOM scans (`querySelectorAll`,
  `getBoundingClientRect`, `TreeWalker.nextNode`) on timers, plus the rest of the HTML parse. 24–39 long tasks
  (2.5–6.1 s in all, worst 0.45–1.0 s): this is the "lagging right when I open it".
* **IndexedDB.** Reads at boot ≈ 60 gets (all synced lists, 12+ MB structured-clone); each pulled list is written back
  (52 puts on a warm open today). localStorage is nearly full (2.5 M chars) and read often.

### Blocks that run at boot but are only needed on certain pages
74 blocks, **7.5 MB of the 22.8 MB of script**, are screens / tools opened from a menu, not Field home: SEED DATA 701 K,
the estimate builder's HTML (atob) 606 K, BB 470 K, voice input 407 K, DOCLIB 303 K, MKT 292 K, LEADS 240 K, SDS 194 K,
LD2 182 K, MKT2 175 K, AUTO8 165 K, CERTPLAN 163 K, QBCSV 140 K, COMPANYDOCS 132 K, LEGAL3 130 K, ADM 129 K, ESTIN 126 K,
TD2 125 K, SOC 125 K, TRAIN 123 K, ESTPDF 119 K, ENVCOMP 118 K, AUTAI 115 K, OFFICETV 113 K, PB2 109 K, RP 108 K, SUB 104 K,
AUTO7 98 K, MITWS 97 K, AUT3 96 K, HRDOCS 92 K, IICRCTRAIN 87 K, DATAFULL 87 K, COTRAIN 80 K, STMTPDF 78 K, RESTOTRAIN 66 K,
EPAHUD 60 K, … Most cost little CPU at boot (they define functions and wait); they cost download (≈2 MB brotli of the
6.1 MB), parse, memory, and — mainly — they sit in front of PMFIELD in the document, so the starved parser has to get
through them before Field home. Desk-only patches that DO work on a phone at boot (DOM scans after Field home): ROLEAPPS,
AP3/AP2, NAV, TODOPERF, MULTICO-UI, the To-Do / approval badges.

## 2. The plan (ranked by gain per risk)

| # | Change | Expected gain (owner iPhone) | Risk | Rank |
|---|---|---|---|---|
| b | **Keep the sync's marks** (IndexedDB, per list: cloud stamp + fingerprint of this device's copy); warm open asks only key+stamp and downloads what changed | −29 MB raw JSON / −0.4–0.8 MB wire per warm open; the 1–7 s post-paint burst of parse/merge/idbSet/re-render goes; frees the link for the screen's own reads | Low–medium: a skipped list must really be current. Guarded: exact stamp equality (clock-skew safe), fingerprint of the local copy (an unsent local change is never hidden — it is pulled and the SAVES "ahead" check sends it), only lists whose apply completed, 7-day limit, same user, kill switch; the 10-min full pull stays | **1** |
| a | **Service worker serves the page from a saved copy** (phones "fast", desks "safe"); the page keeps the copy right; new builds downloaded when idle | Warm: −1–5 s of revalidation, opens offline. **After a release: ~150 s → ~20 s** (old build opens at once, stale gate holds it; the update is instant once downloaded) | Medium: stale copies become routine (the stale gate is now load-bearing); interplay with BOOTWATCH/AWAY cache clearing; iOS evicts SW caches after ~7 days unused (falls back to network) | **2** |
| d | **Quiet first 10 s on a phone**: desk-only patches do not start their scans / badges / sweeps on a Field device until 10 s after Field home or the first idle; the non-critical rest of boot work moved to an idle queue (chunked, ≤ 50 ms slices) | The target "no long task > 100 ms in the 10 s after paint" is only reachable with this; also lets the parser reach PMFIELD sooner | Medium: ~25 patches touched; each must tolerate starting late (most already pace themselves through the governors) | **3** |
| c | **Split index.html**: page-only blocks into committed, content-hashed JS files (tools/split_FASTOPEN.py generates them; the site stays deployable from git with no build command), loaded on first use; the service worker caches them by hash | −2 MB brotli per release download, −7.5 MB parse; Field-critical code reaches the parser first; external scripts get a code cache on iOS/Chrome | High: 940 patches with ordering assumptions (wrappers of `_supaUpsert`, `DOMContentLoaded` hooks, globals read at boot) — needs a dependency audit and the QA gate on every split | 4 (after d) |
| e | **Trim the biggest boot reads**: one cached read of `gc_office_tasks` (3× 0.7 MB), `gc_tombstones` (2×), `gc_sub_approvals` (2×); `gc_folded` (3 MB, a fold log) out of the phone's pull or chunked; `__est__gc_ests_v2`/`estimates` on a phone only when a screen wants them (STUCKFIX already does part) | −3–6 MB raw per open | Low per item | 3–5 (cheap, do alongside) |
| — | **First open of a device**: the BOOTWATCH "Opening GrayCo Field…" cover becomes the one blocking "Loading your data…" screen with progress (lists done / MB) on the first sign-in only | Owner's rule (2) | Low | with b |

## 3. The prototype (branch claude/fastopen, tools/patch_FASTOPEN.py; not for release yet)

(b) + (a), plus one piece of (d): on a phone the sync's first pull waits until Field home is drawn.

* **(b) marks that survive a reload.** After each pull, the lists that were applied are kept in IndexedDB `gc_fastopen`
  (`{u: updated_at, hu: the stamp in the key+stamp read, h: SHA-256 of what was written here}`, same user, ≤ 7 days). A
  **write watch** (`gc-patch-fastopen-dirty`, the 4th script of the page, before BOOTSAFE) marks every write of the CRM's
  IndexedDB store that is not the sync's own apply; the mark is issued before the write and kept in IndexedDB (not
  localStorage: the owner's phone has it full — a first version there dropped the marks at every open). At the next open a
  list is skipped only if the cloud's stamp is **exactly** the kept one (any change, even stamped by a slow clock, is
  pulled), nothing wrote it here since, and the key is still there (a key-only read; no value is read or parsed at open).
  A list written here is pulled and merged as before, so a change made here and not sent is never hidden. Once the open has
  settled (45 s), a list that was written here but is still exactly what was applied (the screen writes pulled lists back)
  is re-armed. `_gcPullNow(true)` and the 10-minute full pull are unchanged; never kept: the delete lists
  (`gc_tombstones`, `gc_deleted_projects`), a skipped apply (estimate builder open, per-computer keys), a list this device
  is ahead on, a list whose upload failed.
* **(a) the saved page.** `/crm-push-sw.js` (the worker BOOTWATCH and AWAY already keep; push unchanged) answers only GET
  navigations of `/` and `/index.html` from `gc-crm-shell-v1`. The PAGE fills it, 30 s after Field home (8 s on a desk): its
  own build (a revalidated read) or a newer live build (downloaded when idle; kept only if the `BUILD_ID` inside the
  download equals `/version.txt`). As soon as the page sees a newer live build, the copy is marked stale, so a reload or
  "Tap to update" goes to the network unless the new build is already saved (then it is instant). Phone: "fast" (the copy at
  once); desk: "safe" (network first, the copy after 8 s / offline). AWAY and BOOTWATCH's update keep the copy only when it
  is the live build; BOOTWATCH counts it as a cached copy (its banner); the **stale gate holds the old copy's automatic
  uploads and sweeps** exactly as for any cached copy. Kill switches: `gc_fastopen_sw_off` / `gc_fastopen_marks_off` = '1'
  on a device; a `crm-push-sw.js` without the fetch handler turns (a) off everywhere at the next open.

### Before / after (same profile, made back to back: ab_base3 vs ab_defer)

| | baseline warm | prototype warm | baseline cold (after a release) | prototype cold |
|---|---|---|---|---|
| page | 304, 0.9 s | saved copy, 2.1–2.3 s (24 MB read from the cache under CPU ×3) | 6.1 MB, 130 s | saved copy, 2.1 s; the new build is downloaded in the background |
| Field home | 25.3 / 27.3 / 27.6 s | 29.7 / 28.8 / 25.3 s (no change: see below) | 149.8 s | **25.6 s** |
| long tasks in the 10 s after Field home | 4.9 / 9.6 / 6.7 s, worst 0.8 / **6.9** / 1.0 s | **2.5 / 2.5 / 3.1 s, worst 0.28 / 0.48 / 0.44 s** | 3.5 s, worst 1.1 s | 3.1 s, worst 0.42 s |
| time to interactive | 38.2 / 38.9 / 38.4 s | 41.6 / 41.0 / 37.1 s | 164 s | **37.4 s** |
| downloaded | 1.23 / 1.40 / 1.33 MB | **0.49 / 0.63 / 0.63 MB** | 7.4 MB | 1.05 MB |
| JSON read from the cloud | ~16 MB | **~4–6 MB** | ~14 MB | ~12 MB (the new release's own reads) |
| lists in the first pull | 52 (12.6 MB) | 3 (the rest checked by stamp: 36 of 39 kept) | 52 | 3 |

Also measured on the way: without the "wait for Field home", the smaller pull arrived BEFORE Field home and its apply
competed with the parser (Field home 30–44 s); the wait fixes that. The tests (tools/tests/test_FASTOPEN.mjs, made-up
data, 42/42): offline the CRM opens from the saved copy with this phone's data; a new build is downloaded in the
background, checked and opens next time from the copy; while an old copy is open the stale gate holds its automatic
upload (nothing written) and a person's own save goes; a newer build not yet saved → the reload goes to the network; a
warm open downloads only the list that changed in the cloud; a list written here (unsent) is pulled and merged, never
hidden; kill switch empties the copy.

**What the prototype does NOT fix (the owner's rule 1):** Field home still waits for the HTML parser to reach PMFIELD
(line 213 k of 250 k), and the 10 s after it still carry ~2.5 s of long tasks (worst ~0.3–0.5 s, down from 0.8–6.9 s).
That needs (d) the quiet first 10 s on a phone and then (c) the split; (e) next: `__est__gc_ests_v2` / `estimates`
(5.3 MB) are rewritten by the estimate heal at every open, so they are pulled every time; `gc_office_tasks` is read 3× (2.1 MB).

### Risks still open before a release
* Stale opens become routine on phones: the stale gate (REGFIX) is now load-bearing; the QA gate should run a "stale copy"
  walk every release.
* The saved page read costs ~1–1.4 s more than a 304 in the harness (CPU ×3 on a 24 MB body); on a real iPhone with a weak
  signal the 304 is usually slower, but measure on the device (BOOTWATCH `nav` / `__GC_SHELL__`).
* A write to the CRM store by a pre-FASTOPEN tab open at the same time is not watched (only during the roll-out).
* iOS deletes a site's worker cache after ~7 days unused: the next open is a normal network open.
* Harness: the gate's harness blocks service workers and serves http; these numbers used a copy that serves https and
  allows the worker (scratchpad fastopen/harness_fo.mjs, `GC_HARNESS_SW` for the test).




## 4. Resume — coming back into the app (11/20–21, branch claude/fastopen2)

Owner 11/20, in the field (GrayCo Field, iPhone): "Keeps lagging when I get back into it too. The app has got to work quickly
while I'm in the field." Also: My Schedule blank / frozen after a 5G → Wi-Fi switch.

Measured offline (session scratchpad `fo2/resume.mjs`): real-data snapshot of 11/19 in the fake cloud, owner-iPhone profile
390×844, **CPU ×4**, 400/150 kbps, 300 ms RTT, localStorage full. A "return" = the page hidden, JS suspended for 60 s (as iOS
does: every timer that falls due piles up), then visible + focus (every 2nd one also offline → online = a network switch); a
tap on ☰ More 0.3 s after the return; long tasks counted for 10 s. The build machine was shared with other agents' browser
tests (load 2–3 on 4 cores): single numbers vary a lot; compare ranges.

### What a return did (main 9d50476)

1. **Every return after > 1 min away, and every "online" (a network switch), re-downloaded every synced list.** The catch-up
   (`catchUp()` in "back online / back to the screen", line ~130630) called `_gcPullNow(true)`: all 52 lists' values,
   **12.4–13.1 MB of JSON per return** (0.8 MB on the wire, ~16 s on one bar), then parsed by the fetch wrappers (TOMBFIX,
   files-in-storage, the learner…), merged, written to IndexedDB and redrawn: 1.0–1.6 s freezes 4–7 s after the return.
2. **The pulls piled up.** `_gcPullNow` cleared the sync's "a pull is running" flag and started another pull beside it; the
   focus / visibility / tab / catch-up handlers called it 4–7 times within seconds. Traced: 5–7 downloads of all 52 lists side
   by side on the slow link, all arriving ~90 s later and parsed together; twice the page ran out of memory and closed (on
   the phone that is a blank page — a likely cause of the blank My Schedule after the network switch).
3. **~90 return listeners and ~150–300 overdue timer callbacks ran in the same moment** (visibilitychange / pageshow / focus /
   online on window/document: the sync, photos, leads, approvals, version check, To-Do, badges…; plus every setInterval /
   setTimeout that fell due while suspended). Each started its own read or redraw; the first frame took 53–226 ms and the
   tap waited behind it.

### What changed (tools/patch_RESUME.py, applied after FASTOPEN)

* **The return is lined up** (`gc-patch-resume`, the page's 2nd script, before anything registers a listener or a timer):
  the return's listeners and the overdue timers go into one queue that starts after the first frame + 0.35 s, runs one per
  task (8 ms slices), waits longer after a long one, lets a tap go first (holds 0.25 s after a pointerdown / key), and runs a
  listener queued twice in one return once (an interval once, however many ticks it missed). As before: the hidden-going
  events (the saves on the way out), element focus, events the page sends itself, a hidden tab's timers (a desk's background
  sync), everything before the first hide (the open), and the page's "native" timers. Kill switch `gc_resume_off = '1'`;
  `__gcResume.state()`.
* **The catch-up checks instead of re-downloading**: `_gcPullNow('verify')` (the catch-up and the 10-minute "everything
  again" pull) uses the FASTOPEN marks: a list this page applied, not written here since (write watch; a list the screen
  wrote back unchanged is recognised by its fingerprint) and whose cloud stamp is still EXACTLY the applied one is not
  downloaded; every other list is downloaded and merged as before. A real full pull still at `_gcPullNow(true)`, every 6 h,
  with the marks off, or when the write watch is not working.
* **One pull at a time**: a `_gcPullNow` call while a pull runs waits for it, then one follow-up pull runs for all who asked
  (the widest ask). A pull running > 3 min is taken as stuck (as before). `_gcFastOpen.marks.info()` → `trace`,
  `coalesced`, `reverified`, `rebased`.
* Nothing of the open is run again at a return (checked: no boot work is in the queue; BOOTWATCH's resume check is one of
  the queued listeners).

### Before / after (same profile; main vs claude/fastopen2, runs ab_base / ab_fo2 / net_fo2 / fo2d)

| | main 9d50476 | claude/fastopen2 |
|---|---|---|
| JSON downloaded in the 10 s after a return | **12.4 / 12.4 / 13.1 MB** | **1.2 / 1.4 / 1.7 MB** (network switch: 2.4 / 8.6 MB) |
| worst long task in the 10 s after a return | 1.0 / 1.4 / 1.6 s | **0.37 / 0.44 / 0.52 s** (one outlier 6.4 s on a loaded machine, not reproduced in 4 more returns: 0.36–0.84 s) |
| first frame after the return | 53 / 57 / 226 ms | 4 / 5 / 55 ms |
| tap on ☰ More 0.3 s after the return (to the sheet drawn) | 653 / 859 / 2251 ms | 190 / 562 / 607 / 1036 / 1607 ms |
| the same tap with the page idle (floor) | 423 / 498 / 1560 ms | 656 / 792 / 1199 ms |
| cold open (fresh tab), Field home | 28.1 / 29.4 s (page 304 from the HTTP cache) | 31.0 / 34.4 s (page from the saved copy, +~2 s to read 24 MB under CPU ×4) |
| long tasks in the 10 s after Field home (cold) | worst 1.0 / 1.1 s | **worst 0.26 / 0.33 s** |
| lists in the first pull of an open | 52 | 1–3 (39 kept by stamp) |

**Not reached in this harness:** tap < 300 ms and Field home < 2–3 s. At CPU ×4 the page is ~65 % busy even when nobody
touches it (idle-tap floor 0.4–1.6 s on main too): the desk-only DOM scans (AP3 `acceptNode`, NAV `isScreen`, J's list
guard, QBCSV `decorate`, DESKFIT `tick`, TODOPERF, the invoice matcher's `partyOk`/`sameInvoice`, ADM tasks, PROJTBL `desk`)
run on a Field phone; and Field home still waits for the HTML parser to reach PMFIELD (line ~213 k of 250 k). Those are plan
items (d) "quiet on a phone" and (c) "split index.html" above — the next step. Single-key reads at a return that remain big:
`estimates__chunkN` (1.1–2.0 MB), `gc_office_tasks` (0.76 MB, twice), `leads` (0.75 MB), `projects` (0.57 MB).
