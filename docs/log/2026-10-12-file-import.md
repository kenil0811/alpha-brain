# A table file goes in whole; uploads in the project's sources; the composer, fit and folds (12 Oct 2026)

Branch `feat/file-import`, off `feat/map-view` (PR #6). It has main's Q39–Q40 through PR #5.

## What the owner asked (12 Oct)

- An uploaded CSV was read only in part, and Alpha asked where the file was. Alpha should keep
  the file and pass its place itself, in a `sources` folder inside the project's folder.
- An import takes every data point, unless the person said otherwise or approved fewer.
- The folded panels' double arrow didn't show.
- Send leaked out of the composer.
- Fit to window left a large gap under the rows.
- Dashboard should leave the table's View list. Dashboards as cards Alpha proposes come next, in
  their own entry.

## What was built

- **Core:**
  - `Files.take(..., folder="sources")` keeps every upload in `files/<project>/sources`.
  - The turn after an upload is told each file's document id and path (`upload_prompt`, shared
    by the app and the journeys). It starts for an upload with no project too.
  - **`file_to_table`** reads a CSV, TSV or Excel file whole, in the core, never through the
    document's text:
    - every column, unless the person named which;
    - a column the table lacks becomes a field: number when every filled value reads as one,
      else text;
    - a key column updates on a second import; without one, rows match on their file line;
    - each value's source is the file's name.
- **Window:**
  - the folded panels' arrow is always shown;
  - the composer's model chooser shrinks, so Send stays inside;
  - fit to window measures from the last record to the page bar;
  - Dashboard is out of the View list, and saved views on it open as Table.

## The review

An agent that did not build it found 10 defects. All 10 were fixed:
1. headers the field rules refuse (`Created At`, `2024 Sales`, `Prénom`, repeated names) failed
   the whole import;
2. European decimals in semicolon files were read wrong (2,50 → 250);
3. long ids lost precision and merged rows;
4. a key outside the chosen columns crashed;
5. a re-upload (`name (2).csv`) duplicated every row;
6. non-UTF-8 files were silently mangled (cp1252, UTF-16);
7. extra cells were dropped;
8. duplicate keys and new fields weren't journalled;
9. `N/A` or a refund `-$40` turned a number column into text, and `NaN` passed as a number;
10. fit to window grew while the page was scrolled down.

The lesser points fixed with them:
- a broken CSV is now a plain sentence;
- an apostrophe is no longer taken as a quote mark;
- Excel dates read as dates, and the workbook is closed;
- rows are labelled by their file line;
- the fit uses the table's own page bar and re-measures on a change of view.

The 3,000-row test's own data was wrong (`"1,1000"`); the old reader had accepted it as 11000.

Not done:
- the new fields and the rows are two transactions, not one;
- a file named by its title can match two documents;
- the Dashboard view's code stays for the dashboard-cards work.

## What ran

- **Journey `file_import`** (new; the suite gained an `upload` step that uses the app's own
  prompt): passed with the real model in 22.5 s (`docs/journeys/2026-10-12-1143.md`).
  - 400 rows and every column went into Contacts. Alpha added Email, City, Deal size and Zip,
    and keyed the rows on Email.
  - It never asked where the file was.
- Core: 235 passed; `just lint` clean.
- Window: tsc clean; vitest 487 passed, 1 skipped.
- Probes (earlier today): Send is inside the composer at every size; the gap under the page bar
  is under one row at 1240×820 and 1600×1000.
- `just check-layout` on a backup of the Map check world (run with the title bar merged too):
  272 of 272 states clean at 1100×560
  and 1240×820, light and dark.
- `just stats` (with the title bar merged): 235 core tests; 75 tools; 24 journeys; 241 commits; core 16,322 lines, tests
  5,688, desktop 25,034; lint clean.
- **Not run:** the Mac app with a real upload.
