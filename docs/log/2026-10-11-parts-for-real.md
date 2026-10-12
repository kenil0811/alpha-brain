# Modules as workflows, piece 2b: parts on linked things, and the first run from the app (11 October 2026)

The real ask ran in Kenil's app on the evening of 11 October: the interview, the page "Car
Wash Site Scorecard — Austin" (fourteen items, two gates, a memo), his yes, and the build (16
parts, 16 minutes). Then nothing could run: every item part filled a Score linked to the Site
it read, and the core only knew a part that fills the thing it reads. This entry is what it
took for the parts to run, found by running them.

## Built

- **A part fills a linked thing** (`runtime/parts.py`): a part that reads one thing and fills
  another linked to it (fourteen Scores per Site) fills one row of that thing per row it
  reads; the core makes the row the first time, links it to the row read, marks it as the
  part's own (provenance `part`), and names it after the part unless the part fills the name.
  Values and problems land on that row with their sources, per field. Try again works from
  either page: the row given may be the one read or the one filled.
- **Linked rows come in**: a field the part reads that is a link, or the name of a linked
  thing, arrives as the list of linked rows, so the memo part reads the Site's fourteen
  Scores with their notes. Every field of the row comes in, null when empty: a part never
  dies on a key that was never filled (the fixture's memo did).
- **"After" means ran, not succeeded**: a part after another runs once that one has run on
  the row (every field it fills has a value or a recorded problem), not once it filled
  everything. Before, the missing Census key held every item and the memo behind the
  households gate; now the gates run, the items run, the memo writes "needs more info", and
  the key arriving fills the rest on Try again.
- **The build rules** say so, and ask for a Settings row for every key a part reads, empty
  with its why when the person must provide it. The live module got its `census_api_key` row
  by hand this once (the build predates the rule).
- **The profile** (`runtime/workspace.py`): every part failed on its first real run from the
  app with `python: realpath: …/.venv/bin/: Operation not permitted`. The workspace lives
  inside Alpha's home, which the profile denies; python.org's launcher resolves its own
  symlink with the C library's realpath, which walks the directories above the workspace.
  The profile now allows the metadata, never the contents, of the directories between a
  denied root and the workspace. A test reproduces it with `realpath(3)` through ctypes (it
  fails on the old profile, passes on the new); the journey never hit it because the build
  session's venv there used Alpha's own Python, whose launcher does not resolve.

**Checked.** The chain checks → item (a Score row made, linked, named, its score a named
problem tried twice) → memo reading the scores; a failed row's later parts running with nulls;
Try again from the Score's page; the profile with the workspace inside the home. 267 core
tests, 87 desktop, lint and typecheck clean.

**Run for real, from the app.** 1600 S Lamar Blvd added to the live module; the app's own
scheduler ran the parts on its next tick (the first run: 16 failures on the profile, above;
the second, after the fix and a cleared row): the gates filled 37,900 AADT from Travis County
GIS with the traffic gate Pass, households a named problem (the key); fourteen Score rows,
linked and named: traffic volume 4.4, competitor count 3.5 (three car washes with an active
Texas sales-tax permit), nearest competitor 1.6, zoning 5.0 (CS-V, Austin's zoning layer);
parcel size no TCAD match on the situs address; speed limit and economics with no source or
no price; the five judgement items flagged for a look with a note and no score, as agreed.
The memo part, after the last item, read the fourteen linked Scores and wrote the memo on
the site: "Overall call: Needs more info", the gates line (households not yet screened,
traffic Pass), the fourteen items with their scores or dashes and their notes. The journal
has every run with what each filled and could not. The thing's pages show it in the app;
Kenil's run is the acceptance.

## Later the same night: Kenil's first try, and what it took

Kenil got a Census key, put it into the Settings row and pressed Try again on the two
Census items: "didnt work". Two reasons, one his, one ours.

- The Census Bureau refused the key (`invalid_key.html` behind a 302, checked from the shell
  with the key as stored): a new key works only once the activation link in their email is
  clicked, and the request lapses after 48 hours. The part's problem said "missing or
  invalid"; true, and not enough. He activated it.
- Nothing in Alpha would have moved even with a good key. The items he pressed wait on the
  gates, which had given up after two tries; nothing asked the gates again. And a person's
  edit of a row (`PATCH /api/tables/{name}/records/{rid}`) replaced the row's provenance with
  `{"by": "person"}`, dropping every field's source and problem, so the row looked
  silently empty afterwards.

Built, by mechanism:

- **A change tries again** (`parts.retry`): a changed setting of the module tries again every
  field of the module's rows that could not be filled (attempts back to zero, the problem
  kept until the next try); a changed row tries again that row and the rows linked to it. The
  app's edit route calls it and runs what is due in the background, like a row arriving.
- **An edit keeps the other fields' provenance** and makes the person the source of the
  fields they changed ("you", with the time).
- **A part after another reruns when that one fills later** (`_stale`): every field now
  keeps the core's own stamp of when its part last wrote it (`at`, beside the source's own
  `fetched_at`); a part after another is stale when that one filled a value after this one
  last wrote, so the memo written before the gates filled is written again once they do, and
  the households item scores once the gate has a number. A failed try of the part before is
  not news (else a failing predecessor would rerun its dependents every round).

Checked by the fixture (a changed setting makes the failed checks due; a changed row makes
its checks and its score's item due and keeps its households problem; backdated item and
memo rerun after the checks). The first version of the test stamped the predecessor with a
future date and found what that does: a dependent stale forever; hence the core's own stamps
on both sides. 267 core tests, lint and typecheck clean.

**Run for real, from the app** (his key activated; the setting change predates the code, so
the retry was triggered once by hand, 17 fields): on the scheduler's next tick the gates
filled 91,299 households within 3 miles (Pass; traffic 37,900, Pass); every item after the
gates ran again, being stale: households in the trade area scored 5.0, the four scored
before kept their scores, the five flagged kept their notes, income and car ownership stayed
a problem (the ACS returned no usable income for that block group: the module's own code,
not the key), parcel and price as before; then the memo was written again: "Overall call:
Pursue". Forty seconds from the retry to the memo.

## Left

- Kenil's acceptance: the Census fields in the app, then one change by chat preserving his rows.
- The part's problem for a refused key should say what to do (activate it); that is the
  module's own code, which the build's rules can ask for ("a problem names the fix").
- The same list as the last entry: documents drafted from templates with a page, the
  evaluator through the pages, the library across modules, the model's tools seeing a
  module's things.
