# Notion database UI — feature checklist (as of Oct 2026)

Reference checklist for the table/grid UI. One phrase per item. `(unverified)` = from hands-on knowledge / third-party sources, not confirmed in Notion's help center.

## 1. View tabs & view management
- [ ] View tab bar above the database — one tab per view; click to switch.
- [ ] `+` after last tab — add view; pick type, name, data source.
- [ ] Overflow — extra tabs collapse into "N more…" dropdown (unverified).
- [ ] Drag tab — reorder views.
- [ ] Tab right-click / click active tab menu — Rename, Edit view (opens settings), Copy link to view, Duplicate view, Delete view.
- [ ] Display as — tab shows Icon only / Text only / both.
- [ ] View icon — per-view icon (default = type icon).
- [ ] Sidebar nesting — views listed under database in sidebar with `•`.
- [ ] Show/hide database title — toggle title above tabs (inline DBs) (unverified label).
- [ ] Inline vs full-page — inline DB has hover-only controls and `⤢` expand to full page; can convert both ways.
- [ ] Linked view — `/linked view` shows an existing data source; views/filters/sorts independent of source, data edits sync.
- [ ] Multiple data sources — one database can hold several data sources; "Add data source" / "Link existing data source"; each view picks a source.
- [ ] Lock views — per-view lock; blocks changing type, filters, sorts, columns, widths; data still editable.
- [ ] Lock database — blocks property/view/automation structure changes; rows still addable/editable; "Unlock for me" / "Unlock for everyone".

### View types
- [ ] Table — spreadsheet grid of rows × properties.
- [ ] Board — kanban columns grouped by a property.
- [ ] Timeline — Gantt bars on a time axis, optional table pane.
- [ ] Calendar — items on month/week grid by date property.
- [ ] List — minimal one-line-per-page list.
- [ ] Gallery — card grid with image preview.
- [ ] Chart — bar/line/donut/number chart of the data.
- [ ] Feed — stacked full-content cards, blog/social style, comments and view counts inline.
- [ ] Map — pins from a Place property (max 100 items shown).
- [ ] Form — question-per-property submission form (only on original DB, not linked).
- [ ] Dashboard — grid of widgets (other views), global filters; Business/Enterprise (Mar 2026).

### View settings menu (⋯ / sliders icon)
- [ ] Layout — change view type + per-layout options (§13).
- [ ] Property visibility — show/hide/reorder properties for this view.
- [ ] Filter — open filter rules.
- [ ] Sort — open sort rules.
- [ ] Group — group by property.
- [ ] Sub-group — second grouping level (board/table).
- [ ] Conditional color — rule-based row/card background colours.
- [ ] Load limit — pages loaded before "Load more" (in Layout).
- [ ] Copy link to view — direct URL to this view.
- [ ] Lock views — freeze view config.
- [ ] Source / Manage data sources — choose/add/link data source.
- [ ] Edit properties — data-source-level property list (add, edit, delete).
- [ ] Automations — database automations list.
- [ ] Templates — manage page templates (also via New ▾).
- [ ] Customize layout — page layout editor for row pages (§16).
- [ ] More settings → Sub-items, Dependencies, Lock database.
- [ ] Delete view / Duplicate view.

## 2. Toolbar (right side of tab bar)
- [ ] Filter icon — add/toggle filter bar.
- [ ] Sort icon (↑↓) — add/toggle sort bar.
- [ ] Automations (⚡) — view/create automations.
- [ ] Search (🔍) — expands to inline search box; matches titles and property values; shown when ≥3 pages.
- [ ] Settings (⋯ / sliders) — view settings menu.
- [ ] `New` (primary button) — create page with default template; opens in configured peek mode.
- [ ] `New ▾` dropdown — list of templates, "Empty page", `+ New template`, per-template ⋯ (Edit, Duplicate, Delete, Set as default for this view / all views, Repeat).
- [ ] Rule chips row — under toolbar, shows active filter/sort chips, `+ Filter`, "Reset" and "Save for everyone" when edits are unsaved/personal.
- [ ] Share / Ask AI — page-level actions for full-page DBs (unverified for AI placement).

## 3. Filters
- [ ] Simple filter — one chip per property; click chip to edit operator/value.
- [ ] Add filter — pick property from searchable list.
- [ ] Advanced filter — rule list with `Where` / `And` / `Or` connector; convert via chip ⋯ "Add to advanced filter".
- [ ] Filter group — nested group with its own and/or; nest up to 3 levels.
- [ ] Per-rule ⋯ — Delete filter, Duplicate, Convert to group (unverified for last two).
- [ ] Save for everyone — persist personal filter edits to the view for all; otherwise personal/temporary.
- [ ] "Me" token — person filters can target the current viewer.
- [ ] Sub-item filter scope — Parents only / Parents and sub-items / Sub-items only.

### Operators by property type (unverified labels, standard Notion UI)
- [ ] Title / Text / URL / Email / Phone — Is, Is not, Contains, Does not contain, Starts with, Ends with, Is empty, Is not empty.
- [ ] Number / ID — =, ≠, >, <, ≥, ≤, Is empty, Is not empty.
- [ ] Select — Is, Is not, Is empty, Is not empty (multi-option pick = any of).
- [ ] Multi-select — Contains, Does not contain, Is empty, Is not empty.
- [ ] Status — Is, Is not, Is empty, Is not empty; can pick whole group (To-do / In progress / Complete).
- [ ] Date / Created time / Last edited time — Is, Is before, Is after, Is on or before, Is on or after, Is between, Is relative to today, Is empty, Is not empty.
- [ ] Date values — Today, Tomorrow, Yesterday, One week ago/from now, One month ago/from now, Exact date; relative: Past/Next/This N day/week/month/year.
- [ ] Person / Created by / Last edited by — Contains, Does not contain, Is empty, Is not empty.
- [ ] Checkbox — Is checked / Is not checked.
- [ ] Files & media — Is empty / Is not empty.
- [ ] Relation — Contains, Does not contain, Is empty, Is not empty.
- [ ] Rollup — operators of the rolled-up type, with Any / Every / None quantifier.
- [ ] Formula — operators of the formula's output type (text/number/date/checkbox).
- [ ] Place — text match on name/address (map view).
- [ ] Button — not filterable.

## 4. Sorts
- [ ] Add sort — property + Ascending/Descending.
- [ ] Multi-level — several sort rules; earlier rule wins; drag `⋮⋮` to reorder priority.
- [ ] Per-rule delete `×`; "Delete sort" clears all.
- [ ] Type semantics — text A→Z, numbers numeric, dates chronological, select/status by option order (manual).
- [ ] Quick sort — column header menu Sort ascending / descending.
- [ ] Manual order — with no sort, drag rows to reorder; sort active → drag disabled/prompt to remove sort (unverified).
- [ ] Save for everyone — same personal-vs-shared model as filters.

## 5. Group & sub-group
- [ ] Group by — any property (date groups by Relative/Day/Week/Month/Year; text by exact or alphabetical first letter) (unverified for text/date granularity labels).
- [ ] Sub-group — second level (board rows / nested table groups).
- [ ] Group header — name, colour chip, count, `+` add page into group, ⋯ (Hide, Collapse, Edit option).
- [ ] Per-group count — number of pages shown next to group name.
- [ ] Per-group calculations — table footer calcs repeat inside each group.
- [ ] Collapse/expand group — toggle arrow on header.
- [ ] Hide/show group — eye toggle in Group settings; hidden groups listed at end (board "Hidden groups" column).
- [ ] Hide empty groups — toggle.
- [ ] Sort groups — Manual (drag) / Alphabetical / Reverse / Ascending / Descending.
- [ ] Color columns — board: tint columns with option colour.
- [ ] "No {property}" group — holds pages with empty value.
- [ ] Remove grouping — settings → Group → Remove.

## 6. Properties (columns)
- [ ] Property visibility — eye toggle per property; "Hide all" / "Show all"; search box.
- [ ] Reorder — drag header or `⋮⋮` in property list.
- [ ] Resize width — drag header edge.
- [ ] Wrap — per-column wrap; "Wrap all columns" layout toggle.
- [ ] Freeze up to column — pins columns left through the chosen one while scrolling horizontally.
- [ ] `+` at end of header row — add property (pick type, name).
- [ ] `⋯` at end of header row — open properties panel (unverified).
- [ ] Limit — max 500 properties per database.
- [ ] Row page property display — Always show / Hide when empty / Always hide.

### Header menu (click column header)
- [ ] Rename inline + choose property icon.
- [ ] Edit property — type-specific config panel.
- [ ] Change type — convert to another type.
- [ ] AI autofill — set AI to fill this property (unverified label).
- [ ] Filter — add filter on this property.
- [ ] Sort ascending / Sort descending.
- [ ] Group — group view by this property (unverified).
- [ ] Calculate — set footer calculation.
- [ ] Freeze up to column / Unfreeze.
- [ ] Hide in view.
- [ ] Wrap text / Unwrap.
- [ ] Insert left / Insert right.
- [ ] Duplicate property.
- [ ] Delete property (Title cannot be deleted).

### Property types
- [ ] Title (Name) — page name, always first, opens page.
- [ ] Text — rich text.
- [ ] Number — formats (number, comma, %, currencies…), Show as Number/Bar/Ring with colour + divide by.
- [ ] Select — one coloured option; options sort Manual/Alphabetical.
- [ ] Multi-select — many coloured options.
- [ ] Status — options in To-do / In progress / Complete groups.
- [ ] Date — single or range, optional time, date/time format, timezone, reminder.
- [ ] Person — workspace members/groups; optional limit 1.
- [ ] Files & media — uploads/links.
- [ ] Checkbox — true/false.
- [ ] URL / Email / Phone — clickable contact fields.
- [ ] Formula — computed from other properties.
- [ ] Relation — link pages in another/same DB; optional two-way, limit 1.
- [ ] Rollup — aggregate a property over a relation.
- [ ] Created time / Created by / Last edited time / Last edited by — automatic, read-only.
- [ ] Button — runs actions on click (§12).
- [ ] ID — auto-increment number with optional prefix.
- [ ] Place — location, used by Map view.
- [ ] Verification — wiki page verified/expired status (unverified as of 2026).
- [ ] AI autofill properties — AI summary / key info / translation / custom (unverified labels).
- [ ] Synced/connector properties — GitHub, Jira, Figma, Drive, Zendesk fields (unverified list).

## 7. Rows
- [ ] `+ New page` / `+ New` at bottom of table — append row (in group: append to group).
- [ ] Hover gutter — `⋮⋮` drag handle and `+` appear on row hover.
- [ ] `+` on hover — insert row below; Option/Alt-click inserts above (unverified modifier).
- [ ] Drag `⋮⋮` — reorder row (manual order) or drop into another group to change value.
- [ ] Hover checkbox — appears left of row for selection; header checkbox selects all.
- [ ] Shift-click — range select rows.
- [ ] `OPEN` button — appears on Title cell hover; opens page.
- [ ] Open pages in — Side peek / Center peek / Full page (per view).
- [ ] Peek navigation — up/down arrows to previous/next page; expand to full page.
- [ ] Row menu (`⋮⋮` click or right-click) — Open in…, Open in new tab, Edit property, Rename, Copy link, Duplicate, Move to, Delete, Comment (unverified for Open in new tab/Comment).
- [ ] Comments — row-level discussion; comment count indicator.
- [ ] Sub-item toggle — `▸` on title to expand children; "Show nesting toggle on title".
- [ ] Limits — 250k rows per DB; 2.5 MB per page properties.

## 8. Bulk actions (rows selected)
- [ ] Selection bar — "N selected" floating bar above table.
- [ ] Quick-edit property buttons — set a property for all selected (unverified UI).
- [ ] Edit property — pick property, set value for all.
- [ ] Duplicate — copy all selected.
- [ ] Delete — delete all selected.
- [ ] Move to — move selected to another DB/page.
- [ ] Copy link(s) / Open in… / Comment — via ⋯ (unverified).
- [ ] Cmd/Ctrl+/ — edit all selected entries via command palette.
- [ ] Esc / click away — clear selection.

## 9. Footer calculations (per column, also per group)
Hover footer under column → "Calculate" → choose. `None` clears.
- [ ] All types: Count all — total pages.
- [ ] Count values — non-empty values (multi-select counts each).
- [ ] Count unique values — distinct values.
- [ ] Count empty — pages with no value.
- [ ] Count not empty — pages with a value.
- [ ] Percent empty — % with no value.
- [ ] Percent not empty — % with a value.
- [ ] Number (incl. numeric formula/rollup, ID): Sum, Average, Median, Min, Max, Range.
- [ ] Date / Created time / Last edited time: Earliest date, Latest date, Date range.
- [ ] Checkbox: Checked, Unchecked, Percent checked, Percent unchecked (replaces empty/not-empty).
- [ ] Menu grouping — Count ▸ / Percent ▸ / More options ▸ submenus.
- [ ] Board/group headers — same calc set shown next to group name (default Count all).
- [ ] Timeline table pane — same calc options.
- [ ] Not found in official docs: "Count per group", "Percent per group", "Show as bar" for calcs — treat as unverified; "Show as Bar/Ring" exists on Number property format, not on calcs.

## 10. Cell editing behaviours
- [ ] Click cell — select; click again / Enter — edit.
- [ ] Type on selected cell — starts editing, replacing value (unverified).
- [ ] Text cells — expand into floating editor when wrapped/long.
- [ ] Select/multi/status/person/relation — dropdown picker with search, create option on type, colour per option.
- [ ] Date — calendar popover: End date, Include time, Date format, Time format, Timezone, Remind.
- [ ] Checkbox — single click toggles.
- [ ] Files — upload/embed link popover.
- [ ] Read-only cells — formula, rollup, created/edited fields not editable.
- [ ] Copy/paste — cells and ranges; paste from spreadsheet creates rows/values.
- [ ] Drag-fill — Cmd/Ctrl+D fill down, Cmd/Ctrl+R fill right on selected range.
- [ ] Delete/Backspace — clear selected cells.

## 11. Keyboard shortcuts
- [ ] Arrow keys — move cell/row/block selection.
- [ ] Shift+Arrow / Shift+Click — extend selection.
- [ ] Enter — edit cell / open selected page.
- [ ] Esc — exit edit / select current block / clear selection.
- [ ] Cmd/Ctrl+Enter — act on current (open page, toggle checkbox).
- [ ] Cmd/Ctrl+D — duplicate selected rows (fill down for cell ranges).
- [ ] Cmd/Ctrl+R — fill right.
- [ ] Backspace/Delete — delete selected rows/blocks.
- [ ] Cmd/Ctrl+/ — command menu to edit selected rows.
- [ ] Cmd/Ctrl+Shift+Arrow — move selected blocks.
- [ ] Ctrl+Shift+K / Ctrl+Shift+J (Mac), Ctrl+K / Ctrl+J (Win) — previous / next page in peek.
- [ ] Cmd/Ctrl+Shift+P — Move to (unverified).
- [ ] Cmd/Ctrl+L — copy link (unverified).
- [ ] Space — open selected item preview (unverified for DB rows).

## 12. Buttons, automations, templates
- [ ] Button property — per-row button; actions: Edit property, Add page to, Edit pages in, Send notification to, Send mail to, Send webhook, Show confirmation, Open page or URL, Send Slack notification to, Define variables; supports @mentions and formulas.
- [ ] Automations — triggers: Page added, Property edited, Every {frequency}; any/all trigger logic.
- [ ] Automation actions — Edit property, Add page to, Edit pages in, Send notification/mail/webhook/Slack, Define variables.
- [ ] Automation limits — paid plans; can't chain other automations.
- [ ] Templates — `+ New template`, edit with banner showing DB, preset properties + content.
- [ ] Template ⋯ — Edit, Duplicate, Delete, Set as default, Repeat (daily/weekly/monthly/yearly).
- [ ] Apply template — empty page shows template list to apply.

## 13. Layout options (per view type)
- [ ] Table — Show vertical lines, Show page icon, Wrap all columns, Open pages in, Load limit.
- [ ] Board — Group by, Card preview (None/Page cover/Page content/Files prop), Card size (S/M/L), Fit image, Color columns, Show page icon, Wrap properties, Open pages in, Load limit (per group).
- [ ] Gallery — Card preview, Card size, Fit image, Show page icon, Wrap properties, Open pages in, Load limit.
- [ ] List — Show page icon, Open pages in, Load limit.
- [ ] Timeline — Show timeline by (one date / separate start & end), Show table, Table vs timeline property visibility, zoom Hours→Day→Week→Bi-week→Month→Quarter→Year, Today button, off-screen arrows, drag bar ends/move bar, dependency arrows, Load limit.
- [ ] Calendar — Show calendar by, Show calendar as Month/Week, Show weekends (unverified), Start week on Monday (workspace pref), Open pages in.
- [ ] Map — choose Place property, zoom/drag, click pin to open.
- [ ] Feed — property visibility only; comments/view counts inline.
- [ ] Load limit — 10 / 25 / 50 / 100 pages, then "Load more" (default table 50, board 25/group) (unverified defaults; no limit on calendar/chart/form).
- [ ] Sub-items display — Table/List/Timeline: Nested in toggle / Flattened list; Board/Calendar/Gallery: Card property / Flattened list.
- [ ] Dependencies — Blocked by/Blocking relation; date shifting: shift only if overlap / keep gap / don't shift; avoid weekends.

## 14. Conditional colour
- [ ] Rules list — each rule: filter-like condition + colour; drag to order; first (highest) match wins.
- [ ] Colours — Notion palette (gray, brown, orange, yellow, green, blue, purple, pink, red) background only.
- [ ] Match option — select/multi/status rules can inherit option colour.
- [ ] Target — whole row/card background (no text styling).
- [ ] Supported views — Table, Board, Timeline, Calendar, List, Gallery, Feed (not Chart/Form).
- [ ] Unsupported props — formula, relation, rollup, phone, email, URL, files, button, connector props.
- [ ] Locked view — view must be unlocked to edit rules.

## 15. Charts & dashboards
- [ ] Chart types — Vertical bar, Horizontal bar, Line, Donut, Number.
- [ ] X axis — What to show, Sort by (+eye to hide groups), Omit zero values.
- [ ] Y axis — What to show (Count or property aggregate), Group by (stack), Omit zero values, Cumulative (Count/Sum).
- [ ] Donut — What to show, Each slice represents, Sort by.
- [ ] Style — Color palette, Height (Small→Extra large), Grid line, Axis name, Data labels, Smooth line, Gradient area, Show value in center, Color by value, Legend.
- [ ] Export — Copy as PNG, Download PNG, Download SVG.
- [ ] Chart respects view filters.
- [ ] Dashboard — widgets = views (table/board/calendar/chart/timeline); ≤4 per row, ≤12 total; drag to reorder; drag dividers to resize width/row height; `+` add widget; right-click Duplicate/Delete; global filters across widgets/sources.

## 16. Row page layout ("Customize layout")
- [ ] Heading — pin up to 15 properties under title; backlinks Always show / Show on hover / Off.
- [ ] Property group — all props in sections, searchable, show/hide.
- [ ] Details panel — collapsible side panel with chosen props/modules.
- [ ] Structure — Simple or Tabbed (Content tab + tabs of related views).
- [ ] Comments display — Default / Minimal; page discussions on/off; property icons; full width.
- [ ] Apply to all pages / Reset layout.

## 17. Forms (view)
- [ ] Questions map to properties; types changeable; Required; Description; Long answer; list vs dropdown; max selections.
- [ ] Conditional logic (Business+).
- [ ] Settings — Anonymous responses, who can submit (workspace / web), submission access level, Notion branding, email on submission, submit button text/colour, confirmation message, preview.

## 18. Empty / edge states
- [ ] Empty DB — header row + "+ New page" only.
- [ ] No filter matches — "No results" style empty body with filter chips still visible (unverified copy).
- [ ] Search no match — "No results".
- [ ] Empty group — shown unless "Hide empty groups"; board column shows `+ New`.
- [ ] Calendar/timeline no-date items — not placed; timeline table pane still lists them (unverified).
- [ ] Map — pins missing when address doesn't resolve; >100 items not shown.
- [ ] Chart — prompts to configure axis when unset (unverified).
- [ ] Load more — button at bottom when beyond load limit.
- [ ] Locked — lock icon + "Unlock" prompt when editing structure.

## Sources
- https://www.notion.com/help/views-filters-and-sorts
- https://www.notion.com/help/database-properties
- https://www.notion.com/help/tables
- https://www.notion.com/help/boards
- https://www.notion.com/help/timelines
- https://www.notion.com/help/calendars
- https://www.notion.com/help/lists
- https://www.notion.com/help/galleries
- https://www.notion.com/help/charts
- https://www.notion.com/help/dashboards
- https://www.notion.com/help/maps
- https://www.notion.com/help/feeds
- https://www.notion.com/help/forms
- https://www.notion.com/help/layouts
- https://www.notion.com/help/tasks-and-dependencies
- https://www.notion.com/help/database-automations
- https://www.notion.com/help/database-buttons
- https://www.notion.com/help/database-templates
- https://www.notion.com/help/data-sources-and-linked-databases
- https://www.notion.com/help/intro-to-databases
- https://www.notion.com/help/keyboard-shortcuts
- https://www.notion.com/help/optimize-database-load-times-and-performance
- https://www.notion.com/help/category/database-views/all
- https://thomasjfrank.com/notion-conditional-color-formatting-everything-you-need-to-know/
- https://sparxno.com/blog/notion-lock-page
- https://super.so/blog/how-to-lock-a-notion-database
- https://alternativeto.net/news/2026/3/notion-introduces-dashboard-views-to-turn-any-database-into-a-customizable-control-center
- https://developers.notion.com/reference/post-database-query-filter
