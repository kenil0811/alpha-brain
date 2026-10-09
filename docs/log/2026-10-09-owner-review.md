# The owner's review of the rulebook's window (9 October 2026)

Vikas looked at the rulebook's window (`log/2026-10-09-ui-rulebook.md`) and asked for a second
pass: less text, no decorative icons, Notion's database everywhere, Network, Activity in a
bell, an egg-shaped Second Brain, agents that wear a companion. Same branch
(`feat/ui-rulebook`), same limits, which he confirmed: window only, no core change, no new
route, no new dependency; what needs the core shows disabled with the reason on hover.
`git diff main -- core connectors journeys desktop/src-tauri` is empty.

## What was built (commits 09a92b5 (shared contracts), faa9665, e0d3918)

- **Dashboard tiles** (`ui/MetricTile`, `MetricsStrip`, `DashboardView`): no "At a glance"
  heading, no icons; the number first with its label and basis beside it (two lines); tiles
  sized to their content; a sparkline (records or amounts per week) or a split bar (stages)
  inside the tile; "To check" only when above zero. Home's tiles use the same.
- **Words:** Upload and Download everywhere (was Add files, Export).
- **The toolbar:** view tabs ("All" and every saved list, + to add a view of any of the nine
  types, rename, duplicate, delete, default, drag to reorder), Filter, Sort and Search, all
  left-aligned; Upload as the one primary action only when the collection has a file field;
  ⋯ holds Layout, Properties, Group, Sub-group, Conditional colour, Record page sections,
  Download, Upload, Reset view.
- **The table:** full width, no frame; checkbox and ⋮⋮ handle on hover at the row's edge; a
  "+ New" row inside the table (the sentence bar is gone; sentences go to the panel); a "+"
  column header, disabled (adding a field needs the core); a footer calculation under every
  column with Notion's set by kind (counts, unique, empty and percent, sum, average, median,
  min, max, range, earliest, latest, date range, checked); no page bar when there is one page.
- **Notion parity** (checklist `design/research/notion-database-ui.md`): advanced filters
  (operators by kind, And/Or with one nested level, relative dates), multi-level sorts,
  grouping in table and list with per-group footers, sub-groups on the board, a properties
  panel, layout (vertical lines, wrap, row height, load limit with Load more, open records in
  side peek, center peek or full page), bulk edit of one field, grid keys (arrows, Tab,
  Enter/F2, ⌘C/⌘V, ⌘D fill down, Delete clears), conditional colour in the five chip tones,
  chart type and axes. The window keeps what the core's lists can't hold in the preference
  `view_settings`. Skipped, with reasons, in the checklist's terms: row order (no order in the
  core), linked views, locks, templates, buttons, automations on views, map and feed views.
- **Below the table:** Files always its own section with a drop zone; a CSV opens as an
  editable grid with Download of the edited copy (only for files added in this visit: no core
  route returns a file's content; Save disabled). Intelligence in tabs. Governance as two
  blocks, Always and Never, rules added and edited inline, kept in `governance_rules` (saved
  only; the runtime does not read them yet).
- **A data view over any rows:** `modules/source.ts` (`DataSource`, `tableSource`,
  `memorySource` with lists in `window_lists`, `rowIcon`, `editable`).
- **The shell:** Network with People and Organizations (old addresses rewrite); Activity in a
  popover from a bell beside the workspace name (old addresses open it); the workspace's name
  and logo edited by double-click (image ≤128 px, a letter or emoji; `workspace_logo`); the
  panel wears Alpha's companion avatar; Settings as a full-width grid of cards; Home's
  subtitle and obvious descriptions gone.
- **Intelligence:** tabs Second Brain, Agents, Automations, Skills, Connections. Second Brain
  is an egg (our own force layout in an egg silhouette, real nodes and real links only: you,
  modules, facts, people, organisations, goals, agents, skills); a click opens the thing, no
  Open button; Brain | Facts | Map inside it. Agents, Automations, Skills, Connections and
  Facts are the standard data view; an automation's On and a suggested fact's State write
  through existing routes, every other cell is locked with its reason. Each agent wears the
  companion chosen on its page (`agent_looks`; Alpha defaults to the companion's own). Skill,
  agent and automation pages show their fields as editable with Save disabled (the core has
  no route to change them).

## What ran

- `just stats`: desktop 267 tests in 41 files (1 skipped), typecheck clean; core 210 passed;
  lint clean; desktop 19,495 lines.
- Looked at in a browser (Vite on 1431 proxying the core of a scratch world): Deals (tiles,
  tabs, table, + New, footer, Files, Intelligence tabs), Intelligence › Second Brain and
  Agents, at 1440×900 dark. The agents also looked at Settings, the bell, Network and the
  logo popover, grouping by Stage and the side peek.
- **Not run:** `just check-desktop`, the Tauri app, the journeys (no change to how Alpha
  behaves). The egg was seen only on a small world (three modules, no facts or people).
  Proven by tests and by looking, not by a real run in the owner's app.

## Choices made without asking (say if wrong)

- Home's Done today tile gives the count only; the failures are named in the bell's Activity
  (the rulebook's "failures named" is weaker there).
- Settings lost its left section list for density.
- Connections and facts open in a dialog (they have no page of their own).
- Built-in skills (files, browser, calendar) are rows with no page.
