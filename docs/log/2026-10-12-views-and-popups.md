# Graph in the View dropdown, fewer views, no pop-ups for predefined choices; the Map plan (12 Oct 2026, Q44)

Branch `feat/ui-audit-fixes`, commit df6689e after the entry
[`2026-10-12-home-cards-second-brain.md`](2026-10-12-home-cards-second-brain.md). Window only;
nothing under `core/`, `connectors/`, `journeys/` or `desktop/src-tauri/` changed.

## What was decided (the owner, 12 Oct; Q44)

- **Second Brain:** Graph is one of the data view's View types, not a second switch above the
  table. The owner's question "how is GraphView tied to the backend" was answered:
  - it reads `/api/graph?kind=world`, `/api/intelligence` and each collection's records;
  - `graphOf` merges them in the window;
  - only the layout and drawing are window-only, and ✓/✕ write through `decideFact`.
- **Views:** Table, Board, Gallery, Calendar, Timeline, Form and Dashboard. List and Chart are
  dropped; charts belong to the Dashboard.
- **Toggles:** the chosen part is tinted with a light accent.
- **Lists:**
  - there is no Edit list; a changed list shows Save and Cancel;
  - Share replaces Copy link to list.
- **Pop-ups** are for notices, confirmations and new free input to agents. Predefined choices
  open as dropdowns, as in Notion.
- **Map** (`design/map-view-plan.md`):
  - outlines now, streets later;
  - Apple's geocoder through a Tauri plugin;
  - Alpha proposes turning a city or address field into a place field;
  - shown as the data view's Map type only. The build waits on core G13 and the plugin.

## What was built

- **Graph as a view:** `DataPage` takes an optional `graph` (its drawing and its ⋮ items), and
  Second Brain is now one `DataPage`.
  - In Graph:
    - the toolbar's search finds and centres a node;
    - ⋮ holds Things with no links, Always show names and Refresh;
    - no Filter, selection bar, pager or empty-table lines show under the graph.
  - The graph remembers its view and ★ under its own keys, so a ★ on Table elsewhere doesn't
    hide it.
  - The graph's own toolbar is gone.
- **Retired views:** `ListView`, `ChartView`, the chart settings, `chartPoints` and their CSS and
  icons are deleted. A saved list naming `list` or `chart` opens as Table or Dashboard.
- **Toggle:** `.hswitch` selected = `--primary-soft`, accent text and a thin accent ring.
- **Lists:**
  - **Cancel** and **Save** (on All, **Save as list**) appear in the toolbar, left of ⋮; the bar
    under the toolbar is gone;
  - **Rename list** is a name field in the dropdown under ⋮;
  - ★ on All makes the collection open on All again (before, there was no way back short of
    deleting the list).
- **Share ›** has three items: copy what's shown as a table (tab-separated), download as CSV, and
  download as Excel.
- **⋮ settings** (Sort, Layout, Properties, Group, Sub-group, Conditional colour, sections) open
  in a dropdown under ⋮ with a back arrow (`DataToolbar` `panel`), and focus returns to ⋮.
- **Sidebar:** Move to ›, Change icon › (also on a double-click on the icon) and Hidden projects ›
  are submenus. `MoveDialog`, `IconDialog` and `ViewOptionsDialog` are deleted.
- **Rulebook:** §4, §6 (toolbar, view types), the toggle rule, §12 and rule 31.

## The review

A separate agent that did not build reviewed the diff. All of its findings were fixed:
- table-only UI under the graph;
- no way to unset the default list or rename a list;
- focus lost when the settings dropdown closed;
- Graph not reliably the default;
- a stale "View options" message;
- the search not re-checked once the graph loads, and a refetch on every remount after Refresh;
- dead code, CSS and comments.

New tests cover rename, ★ on All, focus return and the graph showing nothing of the table.

## What ran

- `tsc --noEmit` is clean. vitest: 56 files, 482 passed, 1 skipped. Proven by tests.
- `just check-layout` (Edge, both sizes, light and dark, browser installed or not): 264 of 264 clean. Second Brain is checked in Graph and in Table: the view is kept in the world, so each state now picks its view itself (before, a Table state made the later sizes open on Table).
- One run of the whole suite had one test time out under load (ModulePage, "Alpha opens its agent
  page"). It passed alone and in the next full run.
- Not run: journeys (no change to how Alpha behaves), the Mac app.
