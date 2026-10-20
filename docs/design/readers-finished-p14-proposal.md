# P14: readers, finished — for Kenil's yes

*20 Oct 2026, night. The first of DealPilot's platform pieces (Kenil: "DealPilot first, with its
platform pieces (P14, money, P13) just before it. Start by writing up P14."; Q114). From the fit
analysis (`requirements/alpha-fit-four-projects.md`): "a detail-page step, the row's URL by
default, a robots and terms check when a source is added"; "key on each listing's own ID (Deal
Tracker's lesson)". The scope is §8.2–§8.3 of `requirements/avilo/AB-four-projects-scope.md`.
No code until his yes.*

## What readers do today

- **A reader is Alpha's own know-how**: a script it wrote for one list page, run in that page by
  the browser (read-only by mechanism), returning rows. It is kept only once it returned rows.
  `reader_run` and a pipeline's read step save the rows into a table matched on a key field,
  mark the rows it no longer returns as gone, and keep old values.
- **Health is checked before anything is written:** no rows, far fewer than last time, or rows
  missing a required field mean it is broken. Doc repairs it.
- **Sign-in walls and bot checks** set the source's status. A bot check is never got past.
- **What is missing:**
  - **The listing's own page.** Nothing opens it. A script could fetch pages itself, but then
    each script invents its own pacing and its own failures.
  - **Sources per value.** A row's values carry only "read by reader X". They don't say which
    page they came from or when (P5 has the shape, `{url}`, but readers don't use it).
  - **The key.** Any field can be the key. Deal Tracker showed the same title as both New and
    Gone in one run: its key wasn't the listing's own ID, and nothing noticed.
  - **Robots and terms.** Nothing reads them.
  - **Pages.** Each browser job starts its own browser, which is fine for one list page and slow
    for forty listings.

Four of your sources' `robots.txt` files, read today:
- POE allows everything;
- Accounting Biz Brokers keeps readers out of `/wp-admin/` only;
- Accounting Practice Exchange has `Disallow: /*_rsc=`, a wildcard rule;
- ATB has none.

Matching has to follow the standard's wildcards (`*`, `$`, the longest rule wins). A matcher that
reads `/*` as "everything under /" would block APE altogether.

## The change

1. **A row's own page, and every value's source.**
   - A read step, and `reader_run`, takes `page`: the field holding each row's own address (a
     link field the reader fills).
   - Every value a reader writes gets its source by code, in P5's shape: the row's own page
     when there is one, else the list page, with the time it was read.
   - Shown on hover like any value's source.
2. **The detail step.**
   - A reader may carry a second script, `detail`, written by Alpha for one listing's page.
     `reader_save` tries it on one row's page before keeping it, as it tries the list script.
   - On a run, the platform opens the page of each row that is **new or changed** since the last
     run (by its key), runs the detail script there, and adds what it returns to that row. Those
     values are sourced to that page.
   - The pages are read one after another in one browser, with a pause between them (a
     politeness judgement in `limits.toml`, with its why). A new op in the driver keeps one
     browser for the list of pages.
   - A page that asks for a sign-in or shows a bot check stops the detail pass. The rows keep
     what the list gave, and the source says why.
   - A detail script that returns nothing on most pages is broken, like a list script: nothing
     from it is written, and Doc repairs it.
3. **The listing's own ID as the key.** Two new health checks, judgements of a failure:
   - **two rows in one run share a key:** the key isn't the listing's own ID;
   - **one run has the same title coming in as new and going as gone:** the key isn't stable
     (Deal Tracker's lesson).

   Either way the reader is broken and nothing is written. `reader_save`'s and `reader_run`'s
   words say to key on the ID the site gives each listing (`IL6399`, `CAS5758`), never a
   position or a title.
4. **Robots, read by code.**
   - When a reader is saved or a source added, the site's `robots.txt` is read and the list page
     and the detail pages' paths are matched against it: the rules for any agent, with `*`, `$`
     and the longest rule winning, per RFC 9309.
   - Read again on a run when it is a day old.
   - A page it disallows isn't read. The reader isn't kept, and the source is **blocked** with
     the reason in plain words ("The site's robots rules ask automated readers not to read this
     page"), like a bot check.
5. **Terms, read by Alpha, kept with their words.**
   - When Alpha adds a source, it reads the site's terms of use (`page_read`) and records on the
     source what they say about automated reading: **allowed**, **not allowed**, **says
     nothing**, or **not found**, with the terms' address and the sentence quoted.
   - The code keeps it only with a quote found on that page (the same rule as a value's source).
   - **Not allowed** blocks the source like robots, said plainly.
   - The source's page shows Robots and Terms beside its status.

## How it will be known to work

- **Tests**, with a fake browser and fixture pages, never the network:
  - `page` sources each value;
  - the detail step opens only new and changed rows, in one browser, stops on a sign-in, and
    keeps the list's values;
  - a broken detail script writes nothing;
  - duplicate and unstable keys are caught;
  - robots matching against the standard's examples, including `/*_rsc=`;
  - a disallowed page blocks;
  - terms without a quote from the page are refused.
- **A journey with the real model**, on one of your public sources (POE Advisors): "Watch POE
  Advisors' accounting practices for sale, with each listing's details". It checks:
  - rows keyed on the listing's own ID;
  - each row with its page;
  - values sourced to that page;
  - the detail step run on the new rows;
  - robots and terms recorded on the source.

## For your call

1. **Terms that say no automated reading:** block the source, said plainly (recommended), or
   only show it?
2. **Robots:** a disallowed page blocks with no way round (recommended, as for a bot check)?
3. **Detail pages:** opened for new and changed rows only (recommended: fewer requests, and the
   list catches price and status changes), or for every row on every run?
