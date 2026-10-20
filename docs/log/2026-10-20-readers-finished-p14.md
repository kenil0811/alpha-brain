# P14: readers, finished (20 Oct 2026, night)

DealPilot's first platform piece (Q114). Kenil, on `design/readers-finished-p14-proposal.md`:
"Yes, build P14 as written, with the three recommendations: terms that say no block the source,
robots disallow blocks, detail pages for new and changed rows only." Q115. Committed on
his word (below).

## Built

- **Robots, by code** (`connectors/robots.py`):
  - the rules for every agent (`User-agent: *`, groups combined), matched by RFC 9309: `*`, `$`,
    the longest rule wins, an allow wins a tie;
  - kept a day in the world's meta (`readers.robots_stale_h`);
  - a site with no rules file allows everything;
  - one that can't be reached is read again on the next run, and nothing of it is read
    meanwhile;
  - the core reads `robots.txt` itself, with the certifi bundle.

  Your four sources read today, matched right: APE's `Disallow: /*_rsc=` blocks only addresses
  carrying `_rsc=`.
- **A source keeps what its site says** (`sources.robots`, `robots_words`, `terms`,
  `terms_url`, `terms_quote`):
  - robots disallowed blocks it, with the rule in words;
  - terms not allowed blocks it, with the sentence;
  - `source_add` (and `world_remember kind=source`) reads robots when a source is added and
    takes `terms`: "allowed" or "not allowed" only with a sentence the code finds on the terms
    page, read again; "says nothing"; "not found";
  - a source given no status keeps its own (before, adding terms would have reset a working
    source to not_built);
  - a module's page shows "Robots rules allow it · terms say nothing on it", with the rule and
    the sentence on hover.
- **The reader run** (`runtime/pipeline.run_reader`):
  - **Gates:** first the terms and the robots rules. A blocked source reads nothing; an
    unreachable robots file skips the run (the pipeline counts it as unreachable, never
    broken).
  - **Keys:** two health checks, judgements of a failure: two rows sharing a key, or an item
    coming in as new and going as gone in the same run (Deal Tracker's lesson). Either breaks
    the reader, and nothing is written.
  - **The detail step:** a reader's `page` (the row's key with each item's own address) and
    `detail` script (`scripts/detail.js` beside `read.js`):
    - each row that is new, changed on the list (compared as the table keeps it), or never
      read on its own page is opened, one page after another in one browser, with a pause
      (`readers.detail_pause_s`);
    - each page is checked against robots first;
    - a bot check or a sign-in stops the pass, the rest keep what the list gave and are read
      next time, and the source says why;
    - a detail script giving nothing on more than a fifth of the pages is broken, and nothing
      is written;
    - fields the table hasn't are named in the run's line.
  - **Every value's source** (P5's shape, by code): the page it was read from, with the time.
    Values from the list are sourced to the list page, and values from an item's own page to
    that page. This refines the written "the row's own page", which would have sourced a
    list value to a page never read for it.
- **Saving a reader** (`reader_save`, and `skill_keep` kind read): takes `page` and `detail`.
  - The site's robots rules are read first, and a disallowed page isn't kept.
  - A detail script is tried on the first row's page and kept only when it gives something
    there.
  - The words say to key on the ID the site gives each item.
- **The driver** (`browser_session.mjs`): an op `pages` reads several pages of one site in one
  browser, read-only, with a pause between them, and stops at a wall.

## What ran

- **Tests** (`test_readers_finished.py`, 9):
  - robots matching by the standard, including APE's rule and an allow winning a tie;
  - rules kept a day, an unreachable site asked again;
  - a disallowed list page blocks and reads nothing;
  - terms: a sentence not on the page is refused, not allowed blocks;
  - duplicate and unstable keys;
  - the detail step: new rows' pages read, values sourced to the list or their own page,
    nothing opened when nothing changed, only a changed and a new row opened next;
  - a wall stops the pass, and those rows are read next time;
  - a detail script finding nothing is broken;
  - a reader is kept only when its detail script reads an item's page.

  A conftest fixture keeps robots off the network in every test. Core 479 passed, desktop 240;
  lint and types clean.
- **Journey** `reader_with_details` (new, POE Advisors, real model) passed
  (`docs/journeys/2026-10-20-2151.md`, 351 s):
  - from one sentence, Alpha made the reader and the table: 47 listings from all four pages of
    POE's list (38 for sale, 8 acquisition pending, 1 on hold), each keyed on POE's own ID
    (AL2001, CP2044);
  - its detail script read every listing's own page: designation, reason for selling,
    highlights, about the practice, ideal buyer, about the area;
  - all 47 rows have values sourced to the list and to their own page;
  - robots: allowed;
  - terms: "not found". Checked by hand: POE's site links only a privacy policy, and
    `/terms-of-use` and `/terms-and-conditions` answer 404.
- **His world:** Job Watcher's two sources (We Work Remotely, Remote OK) were checked against
  their robots rules before a restart: both `Allow: /`, so nothing it reads is blocked.
- **His look:** the app was rebuilt and restarted at 22:04 BST with this and P14; his world's journal has no
  sentence after it, so his look ran none of the test sentences, and the proof is the tests and
  the journeys; his word: "its fine".
