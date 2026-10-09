# The UI rulebook, in the window (9 October 2026)

Vikas compared two UI rulebooks (v1, written against this app; W1, a generic workspace one) with
what main has, chose rule by rule, and asked for the result to be built on main, in the window
only. The choices are `docs/design/ui-rulebook.md`; the decision is Q33. Branch
`feat/ui-rulebook` from main at 90c1a5a; local commits only, not pushed.

**The limits, decided before any code.** Nothing in `core/`, `connectors/`, `journeys/` or
`desktop/src-tauri/` changes, and no new route: `git diff main -- core connectors journeys
desktop/src-tauri` is empty, the core's 210 tests and its 13,418 lines are as they were. No new
npm dependency. Nothing taken from any other branch. A rule that needs the core shows its control
disabled with the reason on hover (the rulebook's own "never hide a command"). Three rules not
adopted by decision: forced edits (the core refuses a value outside a field's choices or type),
"Task manager is always the first module" (the platform knows no domain; so Home has no Due
tile either), the sidebar's top row as the Mac title bar (the host is not touched). People &
Companies stays a destination of its own, drawn as a module in the sidebar.

**Where the person's choices live.** The order, icons and hiding of modules, pinned records,
footer summaries, dashboards, the sections a record page shows and the workspace's name go
through the core's existing preference route (`core/preferences.ts`: one reader per key in the
window hears a change at once; a read that started before a write never overwrites it). A
window's layout (widths, folded, last tab) stays in localStorage as before.

## What was built (commits ab16eb2 … 767fddc)

- **Foundations** (0a98d51): `tokens.css` folded into one token block in `app.css` (spacing on a
  4px base, radii, the seam shadow, quick ease-outs, `--header-h`); no raw colour outside it;
  five chip tones; serif only for page titles, record titles and metric numbers (section titles
  semibold sans); buttons outlined, primary, ghost, danger; nothing fades in from nothing;
  absolute dates everywhere. The kit gained `Dropdown` (every native select replaced),
  `ContextMenu` (right-click, Shift+F10, ⋯), disabled-with-a-reason on `Button`/`IconButton`,
  `HeaderSwitch`, `PageHeader`/`Breadcrumb`, `MetricTile`, `SectionCard`/`EmptyCard`, `Notice`,
  `ListRow`, `useWidth`. `tokens.test.ts` holds the lines.
- **The frame and the sidebar** (587da00): three parts always; panels fold to strips, resize from
  a handle shown on hover or focus (arrow keys, double-click for wide), and Escape steps the
  focused panel back. The sidebar: workspace button (Manage Workspace and Sign out disabled with
  reasons), Home, People & Companies, the modules in the person's order with their own icons,
  New last, Intelligence and Settings pinned; no heading, no status line, no Activity (now
  Intelligence › Activity; old addresses still open it). Right-click or ⋯ on a module: Open,
  Change icon, Move…, A new module above it…, Hide, View options; Rename and Delete disabled with
  reasons. Drag or Alt+arrows reorder or move inside.
- **Home, Intelligence, Settings** (587da00): one Today card; Intelligence's Second Brain (facts
  waiting for a yes, Provenance on each fact), Agents with a page each (Alpha and each module
  with automations as its runner, built from existing data), Automations, Skills, Connections,
  Activity, Map; Settings with sections on the left from Workspace to Help.
- **The assistant panel** (d0c5974): folds to Alpha's mark; one conversation picker (start,
  archive; delete disabled); a provenance line (time, steps), Retry and Stop; one composer
  (attach, model choice, mic, round send; Enter sends, Shift+Enter a new line; @ says there is
  no one else yet); Approve and Veto on plans and actions, Always allow kept.
- **The Dashboard view** (ebdaef8): 4–7 tiles chosen from the fields, each with one call to
  action that opens exactly its records (a removable "these records" filter), every number with
  its basis, needs-attention by mechanism only; Edit dashboard, kept per saved list.
- **Module pages, the data view, record pages** (8ddd9bf): a module lands on its data, with
  Files, Intelligence and Governance below the fold (the page scrolls; the table no longer traps
  it); the standard toolbar; the table's menus, Duplicate, Pin, Delete, double-click edit with
  click-away save, ⌘Z, frozen columns, footer summaries, the add bar, an empty table that keeps
  its structure; a full page per record at its own address, the page as the form with Save and
  Discard, a leave guard, History with Undo and Redo, sections chosen per collection.
- **Polish from looking at it** (767fddc): charts at the type scale, compact rows, an add bar
  that fits, loading that names its thing, no bare dash in a metric, one header line.

Built by subagents in three waves with written contracts between them; each commit typechecks
on its own (checked in a scratch worktree; two pairs that depend on each other were committed
together).

## What ran

- `just test-desktop`: typecheck clean; 235 tests in 40 files pass, 1 skipped (77 in 21 before).
  `just test` 210 passed; `just lint` clean.
- **Looked at in a browser** (Vite on the allowed port against `alpha serve --no-background` on a
  scratch world seeded with two modules, one nested): Home, Deals (metrics strip, table, record
  page, Dashboard), Settings, Intelligence, at 1240×820 light and dark and at 1100×560; no
  sideways scroll; the three headers' bottoms on one line (52px each, measured).
- **Not run:** `just check-desktop` (Playwright has no Chromium on this Mac; installing one is a
  download, left for the owner to allow), the Tauri app itself (WebKit), and the journeys (no
  change to how Alpha behaves; the window only). Proven by tests and by looking, not by a real
  run in the owner's app.

## Not done (needs the core unless said)

- Modules: rename; delete with its three-way choice; Removed modules (restore). Workspaces:
  several, Manage Workspace, Sign out. Conversations: delete.
- Fields: add a column, rename a field; reset to a computed value.
- Proposals: the expected outcome and how success is judged (plans and actions carry neither);
  the data-sharing notice; which route answered and which records a reply used.
- @-mentions: Alpha is the only agent.
- Saving the dashboard's "these records" filter as a list (the core keeps only its own list
  config keys).
- Record pages: notes are kept as a wiki page with a per-record topic and read through the
  notes list (no per-record route); History reads the last 500 activity entries of the module;
  provenance is per record, not per value; a file can't be added to a file field before Save;
  what Alpha may do with a record.
- Second Brain: forget an accepted fact, edit a fact or a goal; facts as a standard data view
  (a list for now). Connections: a Blocked state, which modules use each. Home: suggestions;
  Stop on "Alpha is working on" (no id to stop). Dashboard: goal progress and suggestion tiles.
  Module Files lists only what was added in this visit. Governance's may/may-not rules.
  Settings: Notifications and Builder rules are empty cards.
- In the window, left: the unsaved-changes guard on closing or reloading the window; a new
  record's defaults from the active filters; a keyboard user doesn't hear a disabled menu item's
  reason (Radix skips it); the older stylesheet's raw paddings and radii are not all tokens
  yet; "Done today"-style period labels kept.

## Questions left for Vikas

Hiding a module hides what is inside it; View options is in the workspace menu too; a row click
waits 220 ms so a double-click can edit; Freeze means "the first N columns"; the conversation
picker lists live conversations from every module; Back after saving a new record returns to the
empty form; Edit dashboard sits in the dashboard's own row (the rulebook says ⋮ More); a relation
to a person or company is a plain pill.
