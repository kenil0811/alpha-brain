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

**Stage three, next:** the views the page lacks (gallery, timeline, a form view, a graph of
relations), choosing the field a board, calendar or chart uses, click-to-open with double-click
or Enter to edit, selection with bulk delete after a confirmation, the record page with a back
stack for links, and the tests for the page itself.
