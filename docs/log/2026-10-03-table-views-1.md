# The table views, stages one and two (3 October 2026, night)

The second slice of the port decided with Kenil (Q28, `2026-10-03-review-pr3.md` §8, item 1),
rebuilt on main's own table page; nothing copied from the pull request.

**Stage one, the shape.** `desktop/src/modules/views/` holds what was one 932-line file:
`engine.ts`, the pure part of a view (search, filters, hiding done and gone rows, sort,
paging, totals, grouping, days) with seven tests; `cells.tsx` (a cell shown or edited, the
provenance marks, the file cell, the long text); `TableView`, `BoardView`, `ListView`,
`CalendarView`, `ChartView`, `RecordPanel`, `AddRow`; `DataPage.tsx` is the orchestrator at
421 lines. What the person sees did not change, with one correction: empty values sort last in
both directions (they came first in descending order).

**Stage two, saved lists in the world.** A saved list (the search, the filters, the columns
shown, the sort, the kind of view, under a title) is world data: it follows the person to
another Mac, Alpha can make one when asked, and removing the table removes its lists. Built:
the `views` table (`store.py`); `world/views.py` (save, update, star one as the table's
default, delete; the table must exist and the fields a list names must be its fields);
`GET/POST /api/tables/{name}/lists`, `PATCH/DELETE /api/lists/{id}`, each change journaled as
the person's; `lists` on the table's own route; the `list_save` tool ("keep a list of the
sold ones, by price"); purge takes a table's lists with it. The page: lists come from the
core; lists the window kept before today move into the world once on the first load and the
old key goes; a table opens on its starred list; the Lists section of the options popover
saves the current filters as a list, saves them to the current list, makes a list the default,
removes it; the list picker marks the default with ★. Four core tests (`test_views.py`).

**Found on the real check.** The options popover ran off the bottom of the window (the columns
list is long) and its last items could not be clicked; a menu or popover now scrolls inside the
room Radix measures.

**What ran.** `just test` 177; `just lint` clean; desktop typecheck clean, 18 tests. In the
browser pane against a background-free core on a backup copy of Kenil's world: Deal Listings
filtered to Active, saved as "Active deals", made the default, the page reloaded and opened on
★ Active deals with 199 of 837 rows; the core confirmed the list, its filter and the star.
The app rebuilt and reopened.

**Stage three (the same night).** The interaction model from the pull request, rebuilt: a
click opens the row, a double-click, Enter or F2 edits a cell (the tooltips say so); rows
open from the keyboard too. A selection column with a bar (N selected · Remove · Clear);
removing asks with a `Confirm` from the kit (the dangerous button names what it does) and
reports how many went when one refused; the record panel asks before Remove. Two new views:
**Gallery** (cards with the title and up to four values) and **Timeline** (months newest first,
each row on its day), and pickers for which field a board groups by and which date field a
calendar, timeline or chart runs on when a table has several; a saved list keeps those choices
(`group_by`, `date_by`, `measure` in the core's config keys, checked against the table's
fields). Four tests of the page itself with a fake client (rows and the estimated mark; click
opens, double-click edits, Enter saves with the revision; bulk remove after a yes; the panel
asks); the test setup now cleans the document between tests. Checked in the browser pane
against a backup copy: the gallery of Deal Listings, the board grouped by source with its
picker, the food log's timeline. 177 core tests, 23 desktop.

**Still to come in the table views:** a record page with a back stack for links to other
tables' records, and the form view; the graph waits for the knowledge graph's design.

## ⌘K (the same night)

`shell/CommandMenu.tsx`: ⌘K or Ctrl+K anywhere in the window opens a search over everything.
Pages and modules match as you type; from two characters the core's `/api/search` adds people
(to their page), rows (to the module that holds the table), documents (opened with the Mac's
own app) and journal entries (to Activity); a sentence of three characters or more can go to
Alpha as a question, which opens the panel with it as the draft. Arrow keys move, Enter goes,
Escape closes; a late search answer never overwrites a newer one. Two tests (`CommandMenu.test.tsx`).
The design's "search everything with ⌘K" (§8) is built; the pull request's version searched
six fixed pages and called no route.

## Where a fact came from, and the module's page on the module (the same night)

`shell/facts.ts`: every fact on Knowledge › About you and on a person's page says where it
came from in words a person can check: "You said so, 2 Oct", "Alpha noticed it — “…”" (the
words it rests on), "From your own words — “…”", "From ocado.com". A suggestion shows the same
line beside Yes / No. `GET /api/modules/{ref}/page` returns the module's wiki page, and the
module's Summary tab shows it first as "Alpha's page" with Write / Edit, saved through
`POST /api/notes` with the summary kept (the design's module page, §3.1, on the module itself;
ideas 8 and 9 of the port). Tests: the origin wording; the route. Also: `just app-restart`
kills the window and its core together, after three stale cores were found running their
schedulers on the live world when only the window had been killed.
