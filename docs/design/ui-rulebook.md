# Alpha UI rulebook

## 0. How to read this

Alpha is one calm, honest, consistent product. Every screen is built from the same few parts and arranged in the same few ways, so someone who has learned one screen already knows the next.

**Three pillars**

- **Calm.** Plenty of space, few colours, no visual noise, quiet motion.
- **Honest.** No made-up data and no over-promising. When something is empty, unknown or unavailable, the interface says so plainly.
- **Consistent.** Every area uses the same patterns. Learning one screen means knowing them all.

**How the rules work**

- The **fixed rules** are the numbered list in §17, and only those. Elsewhere, "always" and "never" mark a strong default: follow it unless a fixed rule or the person says otherwise (the owner, 11 Oct).
- Everything else is a **default**: the starting point, not the only choice. Inside the defaults, use judgement.
- When a case isn't covered, follow the intent: choose what is most consistent with what already exists and with the principles in §19.
- **Who we design for:** busy, non-technical professionals who ask an assistant to build and run their work for them. The goal is that the person feels calm, in control and never confused.
- **Reference product: Notion.** Wherever Notion has a pattern (pages, tables, the sidebar, ⋮ menus, a record that opens as a page, "/" to insert, ⌘K to search), Alpha behaves the same way.
- Screens that Alpha generates for projects look like they belong to the main window, unless the person explicitly asks for something different.

---

## 1. The feel

### Colour

- A soft, light, slightly cool background. Working surfaces (cards, tables, panels) are white on top of it.
- Text uses three steps:
  - deep navy for titles and primary content;
  - a softer slate for body and secondary text;
  - a warm stone grey for labels, metadata, timestamps and placeholders.
- **One accent:** a muted steel blue for links, the active item, primary buttons, focus rings and selected states. A light wash of the same blue fills active and selected backgrounds.
- **Status tones:** sage (good), amber (warning or dormant) and a warm red (trouble). Never neon.
- **Status chips** are pale pills in five tones: green, yellow, red, blue and grey. Every project maps its statuses onto these five.
- **Red** is reserved for problems: errors, overdue items and destructive actions. Nothing else is red, so red always means something.
- No gradients, no saturated brand colours, no second accent.

### Design tokens

- Every colour, size, radius, shadow and space comes from one shared set of named values. Nothing is coloured or sized by hand.
- Dark mode swaps that set; the roles stay the same.
- **Theme choice:** Light, Dark or Match Mac. Match Mac is the default.

### Type

- **Sans-serif** (Geist by default) for everything functional: labels, data, buttons, body text and section titles.
- **Serif** (Source Serif by default), used in exactly four places:
  1. the hero heading;
  2. a record's title;
  3. the title of a page that has only one section;
  4. large metric numbers.
- Section titles are small, semibold sans-serif.
- Labels, eyebrows (Home's date included), table headers and metric labels are small, sentence case and stone grey. No tiny letter-spaced capitals.
- **Sizes follow Notion** (the owner, 11 Oct): 14px is the working size (tables, the sidebar, buttons, menus, inputs), 16px is reading text (notes, messages, a record's long text), 12px labels and metadata; headings 18, 22 and 30px. The readable minimum is 12px; the one exception is the fully folded sidebar's labels at 11px (§4).
- Weights stay between regular and semibold.
- Digits use tabular figures wherever they line up in a column.
- Every size comes from one type scale of about seven steps.

### Space and shape

- **Spacing:** a 4px grid (4, 8, 12, 16, 20, 24, 32, 40, 48), as in Notion (the owner, 11 Oct). Consistent spacing and alignment count as correctness, not decoration.
- **Corners:**
  - Controls (buttons, inputs, sidebar items) share one radius (6px).
  - Cards, tables, panels and menus share a slightly larger one (8px).
  - Chips, tags and the send button are pills.
  - The chat composer is the roundest element.

### Depth

- The three main columns are separated by soft shadow seams, not hard lines.
- Cards have a border and at most a whisper of shadow.
- Floating things (menus, dropdowns, dialogs) get a soft, clear shadow. Dialogs dim the window behind them.

### Icons

- One thin-line icon family (Lucide), at two sizes: small (16px) and regular (20px).
- Never use emoji or text symbols as icons.
- Icons are stone grey by default and steel blue when active.
- Each project has its own icon, changeable later. Until the person picks one, it is the icon the project's name, then its purpose, suggests (Deals: a briefcase; Food log: cutlery), else the first letter of its name; never a generic table icon (the owner, 11 Oct).

### Motion

- Short, quiet ease-outs for changes of state: hover fades, a panel changing width, a chevron turning, a spinner while working.
- Never animate something in a way that hides it until the animation finishes.
- No bounces, no page transitions, no decorative animation. The companion breathes and blinks but never hops (the owner, 11 Oct).
- Always respect the Mac's reduced-motion and increased-contrast settings.

---

## 2. Words

**Tone:** calm, literal, precise and modest. Explain consequences; never hype.

**Core vocabulary**

| Use | Instead of |
|---|---|
| Workspace | account (the space the person signs in to and works in) |
| Organization | company, firm (a real organization the person is associated with, as in Network; never the person's own workspace) (the owner, 11 Oct) |
| Project, sub-project | module, sub-module, app, package (in code and the store it stays `module`) |
| Page, View, List, Section | screen, tab-page |
| Record, Field, Relation | item, element, entry |
| Second Brain | memory, knowledge, brain |
| Connections | integrations, apps |
| Agent, Skill, Automation | bot, tool, workflow |
| Approve / Decline | accept / reject, veto (for proposals) |

A project may rename "Record" to its own word, such as Deal, Task or Application.

**No subtitles** (the owner, 11 Oct). A title never carries a line of explanation under it, however unfamiliar the term. What a product name means sits in an (i) tip beside it:

| Name | Its (i) tip |
|---|---|
| Second Brain | What Alpha knows about you and your work |
| Intelligence | What Alpha knows and does across your projects |
| Governance | Where this data lives and what Alpha may do with it |
| Provenance | Where this came from, and when |
| Agents | The assistants that work for you |
| Skills | Things Alpha knows how to do |
| Automations | Things that run on their own, and when |

**Habits**

- Labels are in sentence case. Product nouns keep their capitals: Home, Second Brain, Connections, Intelligence.
- Use real ellipses (…), em dashes (—) and arrows (→) on links.
- Empty states use "yet": "No files are attached yet."
- **Dates:** absolute by default ("8 Oct 2026" or "8 Oct, 14:30"). Recent moments may read relatively ("Today, 14:30", "Yesterday", "5 min ago"); hovering any relative date shows the absolute one (the owner, 11 Oct).
- A value nobody knows reads **"Unknown"**. Unknown is a valid answer; a guess is never shown as a fact.
- Never say "Coming soon". Something unavailable is disabled, with a reason (§14).
- Lead with the point; short sentences; no jargon; assume no prior context. Buttons say what will happen.

**Good examples**

- "Nothing needs you right now."
- "Record that the introduction happened? This does not send a message."
- "Your invoices will appear here once a billing provider is connected."

---

## 3. The window frame

Every screen lives inside the same three-part frame:

**Sidebar | Main area | Assistant panel**

- **One header line.** The sidebar's top row, every page's header and the assistant's header share one height, so their bottom edges form a single line across the window, Home's included (the owner, 11 Oct, evening: Home has a header too). The header, both panels and the window's top bar share one colour; Settings › Appearance can change it, and the centre's colour, and the fonts.
- **Nothing sits above a page's header.** Notices about setup or the runtime go inside the page body or, for setup, on Home only.
- **No separate title bar.** The sidebar's top row doubles as the Mac's title bar, beside the window controls.
- **Panel widths.** Each side panel has three widths: normal, wide and folded.
  - Drag the inner edge to resize. The handle appears only on hover or keyboard focus. Dragging all the way in folds the panel to the same strip as its fold button; dragging out has no cap, so the assistant can widen until the middle disappears (it may cover the middle).
  - A folded panel never disappears. It shrinks to a narrow strip; clicking the strip opens it again, and so does a double-click anywhere on its empty space.
  - **Fold button** (the owner, 9 Oct): a small round button with a double arrow, on the panel's edge that faces the middle, at mid-height, half over the seam. It shows while the pointer is over that panel (or on keyboard focus), and it is the same on both sides, folded or not, so a folded panel always has a visible way back. No fold button sits in either panel's header.
  - Escape steps a panel back one level: wide → normal → folded.
  - Sizes and folded states are remembered.
- **Connection problems.** When Alpha's core stops answering, a slim notice at the top of the main area says what is wrong and offers **Try now**. When the core comes back, a quiet line says so. Otherwise nothing about the runtime is shown.

---

## 4. The sidebar

**Contents, top to bottom**

1. **Workspace button:** a logo tile that is the workspace's own mark and never the companion's avatar: the first letter of the workspace's name to begin with, or a logo the person sets (the owner, 11 Oct, reversing the same day's "logo = avatar"), and the workspace name (by default the owner's, "Kenil's workspace", never the assistant's name). Its menu holds the workspaces, **Manage Workspace** and **Sign out**.
2. **Home**, with a small count of what needs the person.
3. **The pre-built projects**, Task manager and Network, shipped on install; ordinary projects in every other way (renamed, moved, hidden, edited or deleted like any other).
4. **The person's other projects,** in their own order. Child projects fold out beneath their parent, indented, behind a chevron.
5. **New project**, always the last item in the list. It opens a New project page (a name, what it is for, one empty table in the standard data view) with **Create project** and **Cancel**. While that page is open the sidebar shows the project being made, above New project, under the name as typed; Cancel (or Escape) goes back where the person was and removes it. **Create project** asks the assistant to build it.
6. Pinned to the bottom: **Intelligence**, then **Settings**. Settings is always the very last item.

**Behaviour**

- Only the project list scrolls. The pinned bottom items never move.
- **Current item:** a soft accent wash, steel text and icon, and a short accent bar on its left edge.
- **Names beside icons** (the owner, 11 Oct): every sidebar item shows its name next to its icon. **Fully folded**, each item shows its icon with its name beneath it in the small label size (11px), with room for up to 12 characters; longer names end in an ellipsis and show in full on hover and focus.
- **No projects yet:** the list shows **New project** (and Home shows the same), never "ask for one". People create; the assistant helps.
- **Reorder:** drag projects up, down, or into another project.
- **Double-click** a project's name to rename it in place (Enter or clicking away saves, Escape cancels); double-click its icon to change the icon.
- **Right-click a project** (or use its ⋮ on hover) for:
  - Open
  - Rename (edits the name in place)
  - Change icon
  - Move…
  - Hide
  - Delete
  - View options
- **Hide** removes a project from the sidebar only. Hidden projects come back from **View options** in the same menu.
- **Delete** asks which of three things the person means:
  - remove the project but keep its data;
  - remove the project and its data;
  - just hide it.
- **Never in the sidebar:**
  - group headings;
  - a theme switch;
  - status lines;
  - agents, automations or individual records;
  - any extra destinations.

---

## 5. Page anatomy

**Header** (at the shared height)

- When a surface has several sections, the header holds a centred **toggle** with one segment per section: small sentence-case labels with icons, and the active segment raised.
- When there is only one section, the header shows its title in serif.
- Switches never wrap onto a second line. When space runs short, they drop to icons only, and the labels come back as soon as there is room again (a switch measures the room in the header, never its own width).
- **One toggle, two levels** (the owner, 11 Oct): page-level sections switch in the header; sections inside a page (Brain · Facts · Map, a card's tabs such as Allowed · Denied or Intelligence's Activity · Agents · Goals) use the **same toggle** in the body, at the top of what they switch. Two different-looking switches for the same job are a defect.

**One layout for every table page** (the owner, 9 Oct)

- Every page whose subject is a table (a project, Network's People and Organizations, Intelligence's lists, New project) is drawn by one shared layout, never by hand: the standard data view (§6) with every dropdown, then Files, Intelligence and Governance. A new project gets all of it with nothing designed.

**Body**

- On data pages, the collection fills the whole first screen; Files, Intelligence and Governance start below the fold.
- Opening a project lands on its data, never on a description of the project.
- By default, the first tab is the first collection; for Task manager, it is the Queue.

**Below the table** (the owner, 9 Oct: replaces the header tabs of Q40)

- The data comes first. As the person keeps scrolling: **Files**, then **Intelligence**, then **Governance**.
  - Intelligence holds what Alpha does here: its activity, its agents and automations (Alpha first among them — Alpha is an agent), its goals (with Add goal, Add agent, Add automation), Alpha's editable page about the project, and **Sub-projects** (the projects inside this one).
  - Governance holds where things are kept, where they are read from, what runs on its own, and what Alpha may and may not do here, each rule with its reason in an (i) tip.
  - Its rules sit under the toggle **Allowed n · Denied n** (a check and a ban icon, the word, the count). Under each: the rules as editable sentences, "Nothing allowed." / "Nothing denied." when empty, and a dashed **+ Add allowed action** / **+ Add denied action** button.
- The scroll is never trapped inside the table.

**Never blank**

- A project or a Network tab with no records still shows one empty table in the standard data view (its toolbar, its header, a few blank rows and **+ New**), never an empty page. Alpha fills it in as it builds.

**No repeated names in one flow**

- The same name never appears twice in a row in a breadcrumb, a header or a path ("Deals › Deals" is a defect). The window collapses such repeats, and Alpha never names a collection, list or sub-project the same as the project that holds it. Different projects may reuse a name (Sources in Deals and in Network).

**Structure follows the data**

- Different slices of one collection are Lists or Views of that collection, not new pages.
- Linked collections in one project become sibling tabs in the header.
- Closely related but unlinked areas become sub-projects.
- Unrelated areas become separate projects.
- Every record has its own page (§7).

---

## 6. Collections: one standard data view

Every collection, everywhere, is shown through one shared data view. Pages don't hand-build their own table, toolbar or filter.

### Toolbar

One row that never wraps, in this order:

**Saved list · View · Search** on the left; **Filter · frequent actions · ⋮ More** on the right

- **A list is a saved view of the collection:** its filters (which rows), its visible columns and their order (which columns), its sorts, grouping and view type. Choosing a list shows exactly the records that qualify; each of them opens its own page, as every record does.
- **Saved list:** the current list's name ("All") opens a standard dropdown of the lists (search, star for the list the collection opens on, **Add list** at the bottom), as in every dropdown (§14). Editing, duplicating, copying a link to and deleting a list live in ⋮ More.
  - **Add list and Edit list open a page, not a pop-up** (the owner, 11 Oct): the list's name, its filters, sorts, grouping, visible columns and default view, chosen on that page against a live preview of the records, with **Save list** and **Cancel**. Nothing is saved until Save list.
  - **Changes in the toolbar are temporary** (the owner, 11 Oct): filtering, sorting or grouping from the toolbar or a column heading changes what you see now, and a small bar offers **Save to this list** and **Reset**. A list never changes by itself.
  - Lists are kept in the workspace, so Alpha can make them too.
- **View:** a button showing the current view's icon and name (a table icon and "Table") that picks among the view types in the next section.
  - Views the data can't support stay visible but disabled, with the reason, for example "Calendar needs a date field".
- **Search:** a bordered search box, always visible as one (the owner, 9 Oct: a bare magnifier had no boundary); it quietly narrows the visible rows. Search is never saved as a list.
- **Filter:** every filtering choice in one place.
  - Active filters appear as small removable pills under the toolbar, with **Clear all**.
  - The **Hide done** and **Show gone** toggles live in Filter.
- **Frequent actions** sit between Filter and ⋮: at most one primary. **Upload** shows here only when files are the collection's main input (it has a file field).  The page's own actions (New, Add goal, Connect) come last here, before ⋮, and fold into ⋮ with Filter when narrow (12 Oct).
- **Filter** is right-aligned, immediately left of the frequent actions and ⋮ (the owner, 9 Oct; replaces "left-aligned").
- **⋮ More** holds:
  - Sort
  - Add column
  - Column visibility and order (hiding a column keeps it in place in the list; its eye becomes an eye with a slash)
  - Frozen columns
  - Footer summaries
  - Which sections record pages show
  - **Download ›**, one item whose submenu offers CSV and Excel
  - Reset view
- **Narrow windows:** labels collapse to icons first, then Filter moves inside More. The toolbar never runs under the assistant panel; at the window's minimum size every control stays reachable.
- **Download** gives exactly what is shown (the list's filters and the current search), and says how many.

### View types

Table (the default) · List · Board · Calendar · Timeline · Gallery · Chart · Form · **Dashboard**

- Every view uses the same toolbar and the same open, edit and add behaviour. Only the layout of the records changes.
- **Board:** quiet columns with sentence-case headers and counts. Cards can be dragged between columns. It groups by a status or choice field, with a picker when there are several.
- **Calendar, Timeline and Chart:** run on a date field, with a picker when there are several. Grids are faint. Charts use a restrained palette and always show a legend.
- **Form:** one record at a time, with Previous and Next.

### Dashboard view

A page of visuals where **every visual is actionable**.

- **Visual = something to do.** Each tile pairs a visual with a call to action (CTA). If a tile has nothing to act on, it says so in one line ("Nothing overdue.") and its CTA stays visible but disabled, with the reason.
- **Tile types:**
  - **Metric:** a serif number, what it is based on, and a CTA such as "Show these 12".
  - **Breakdown by status or choice:** clicking a segment opens those records.
  - **Over time:** by a date field. Clicking a bar or point opens those records.
  - **Needs attention:** up to 5–7 records (overdue, stale, missing a value, flagged), each with its own inline action.
  - **Progress toward a goal:** the project's goals, with the next step.
  - **Alpha's suggestions for this collection:** each shown as a proposal with Approve and Decline.
  - **What changed?:** the numbers in one line, and **Ask what changed**, for Alpha to explain (12 Oct; Alpha writing it there waits for the core).
- **Aligned with ChatGPT's dashboards** (the owner, 12 Oct): the numbers first (each count and total with its change on the week before), then the charts, then what needs attention; **As of** a time; a period (All time, 30 days, 7 days) that applies to every tile with the toolbar's list, search and filters; **Ask Alpha** to change the dashboard; each change on the week before counts every record, whatever the period; ⋮ holds **Edit dashboard**, **Tell me when…** (Alpha proposes the alert as an automation) and **Download as CSV**. Tiles sit on Home's card grid: a number S, a chart M, Needs attention L.
- **What a CTA does:**
  - opens the collection in another view, filtered to exactly those records (a temporary filter, savable as a list);
  - opens a record page;
  - starts a bulk action, confirmed in a dialog;
  - or puts a sentence in the assistant's composer.
- **Context:** the saved list, search and filters in the toolbar apply to every tile.
- **Layout:** by default, Alpha picks 4–7 tiles from the collection's fields. The person adds, removes, reorders and resizes tiles from **⋮ More › Edit dashboard**. The layout is saved with the list.
- **Every number states its basis.** "Average deal size · 14 deals with an amount" — never a bare score.
- **Available when** the collection has at least one number, status, choice or date field. Otherwise it is disabled, with "Dashboard needs a number, status or date field".
- **Project dashboard (optional):** a project can open on a dashboard spanning all its collections, if the person chooses. It follows the same rules.

### Table

**Container and header**

- A rounded, bordered container.
- A quiet header row with small sentence-case labels and faint lines between columns.

**Rows**

- Evenly spaced and comfortable by default, with a compact option.
- A soft highlight on hover. Selected rows keep the highlight.
- Numbers are right-aligned. Statuses show as tinted pills.

**Columns**

- Resizable, reorderable and freezable.
- A row's checkbox and ⋮⋮ handle appear on hover at the row's left edge (no checkbox column, no left gutter); once any row is selected they show on every row. They never cover text: the cell keeps room for them, and the same holds for the edit pencil at a cell's right edge.

**Opening and editing**

- **A single click anywhere on a row opens that record's page,** after the short pause that lets a **double-click edit the cell in place** (the owner, 11 Oct). The row shows it was pressed at once.
- **No peek.** A record always opens as its full page; there is no side or centre peek (the owner, 11 Oct).
- **Editing in place** starts from a double-click, from the keyboard (Enter or F2 on the focused cell) or from the pencil on the cell. Clicking away saves; Escape cancels. ⌘Z and ⇧⌘Z undo and redo recent edits.
- **Provenance marks** are quiet chips in words:
  - **Estimated** for a value Alpha estimated;
  - **Assumed** for a value resting on an assumption.

  Hover, focus or a click says why, and the value can be corrected in place. The page bar counts how many rows rest on an estimate or an assumption.
- **Relations** show as pills that open the related record's page.
- **File cells** open the file, or show it in Finder.
- **Seen column:** collections fed by a reader can show when each row came and went ("New today", "Since 2 Oct", "Gone 5 Oct").

**Right-click menus** (each one also reachable from the keyboard)

- **Column heading:** sort, filter by this column, hide, freeze, move, footer summary, rename field.
- **Cell:** edit, copy, clear, reset to computed value, show history.
- **Row:** Open, Edit, Duplicate, Pin, Delete. The same actions are on the ⋮ button that appears at the row's end on hover.

**Add row**

- A row at the bottom, **+ New**, adds a record and is always there; it opens the new record's page. (The sentence bar that asked Alpha to fill the fields was removed by the owner on 9 Oct; asking Alpha happens in the assistant panel.)
- When adding isn't possible, the row stays visible, disabled, and explains why.

**Footer**

- Each column picks its own summary, from the options that fit its type (the Notion set):
  - **every type:** none, count all, count values, count unique, count empty, count not empty, percent empty, percent not empty;
  - **numbers:** sum, average, median, minimum, maximum, range;
  - **dates:** earliest, latest, range;
  - **checkboxes:** checked, unchecked, percent checked.

**Empty table**

- Keeps its full structure: the header, a few blank rows, the add row and the footer.

**Page bar**

- Reads "Showing 1 to 50 of 312". With grouping, each group's count is over the whole result, not the page.
- A page-size choice, with "Fit to window" as the default.
- First, Previous, Next and Last.
- Inline status lines for what just happened.

**Selection**

- **Column widths never change on hover** (the owner, 9 Oct). The handle, checkbox and pencil that appear on hover move the cell's text slightly toward the middle within its fixed width; when there is no room the text is clipped under them, as little as possible.
- Selecting rows shows a slim bar above the table with the count, plus actions such as Duplicate, Delete and Cancel.
- Delete confirms in a dialog that says what happens.

### Metrics strip

- A collection's headline numbers sit in one strip of metric tiles **below the toolbar**, above the table, **always shown, with no fold** (the owner, 12 Oct). It is left out only when there is nothing to count (no records) or when the person asks Alpha to hide it (waits for the core, core-changes §G). The Dashboard view shows them in full.
- Each tile is a plain tile (the owner, 11 Oct): the number with its words beside it, and what it is based on. No icon square.
- While hidden, a show arrow sits in the toolbar's frequent actions, left of ⋮; while shown, the hide arrow sits at the strip's top-right corner. The choice is remembered.
- Tiles that need attention get an amber tint (red is only for problems).
- **Size** (the owner, 9 Oct): the whole strip is four lines high at most. Two-line tiles stack two high (Records over Amount); a split is one block spanning both, its bar with one small line of labels under it and the counts on hover. A number never repeats in its own basis ("all added this week", not "7 records, 7 added this week"). More tiles than fit scroll sideways.
- **Only what means something.** A trend line only when there are values in at least two weeks; a split only with two or more categories; "open" and "done" only when some choices mean done. Otherwise the element is not shown.
- **Interactive.** Every chart answers the pointer: a line shows the point's week and value, a split's part its category, count and share. Categories are colour-coded in the fixed series order and always labelled in a legend, so colour never stands alone.
- **Click for details.** A click (or Enter) on a tile opens a dialog with the chart larger and a table of its values.

### Files

- **Upload** opens the Mac's file picker. Files can also be dropped anywhere on a project page; a quiet overlay says where they will go.
- Alpha reads added files into the project's collections and says what it did.
- **Everything Alpha makes here** (reports, summaries, tables, drafts) is saved as a file with a clear name, listed in Files with its history, and linked from the conversation.

---

## 7. Record pages

Every record opens as a full page of its own.

**Sticky header**

- A back link.
- **Back** to the project and the record's name, with no repeated names ("← Deals · Stark advisory", never "Deals › Deals › …").
- **⋮ More**, holding:
  - Duplicate
  - Pin
  - History
  - Delete

**Body**

- One centred, readable column.
- The record's title in serif, with a small sentence-case eyebrow naming the record type and a line icon for that type.
- A card holding all the record's fields, each one labelled.

**The page is the form**

- Every field is editable on the page.
- Field sizes match the expected answer: short inputs for short values, a text area for long text, and the kit's date and number fields, which accept any reasonable form ("13/10", "next friday", "1.2k", "$1,200") and show it back tidied ("13 Oct 2026", "1,200").
- A required field can't be emptied: leaving it empty keeps the old value and says why beside it.
- **Changes save as you go,** the same as a table cell: a field saves when you leave it. ⌘Z undoes, and History keeps every change.
- **And the person always sees it and can act on it.** A new or edited record shows a small bar at the top with **Save** (writes anything still being typed) and, for a record made in this visit, **Cancel** (deletes that new record after a one-line confirm). After a save, "Saved" shows for a moment, then the bar reads "Last saved 14:32". Assist and inform; never leave the person guessing whether it worked.
- **New records always open their own page,** in every project.
- A field that can't be saved keeps the person's input and says why beside it.

**Forced edits**

A forced edit is a value that departs from the field's norm:

- it overrides a computed or automatically filled value;
- it isn't one of the field's choices;
- it falls outside the usual range;
- or it doesn't match the field's type.

A forced edit is allowed. It carries a quiet **Overridden** chip in a neutral tone, never red, with a short note on hover or focus ("Overrides the computed value 1,240"). It stays editable, and **Reset to computed value** sits in the field's menu.

**History** (⋮ More › History)

- Every change to the record, newest first.
- Each entry shows who made it (you, Alpha, or a named automation or agent), the old and new value, and the absolute date and time.
- **Undo** and **Redo** step through the history, and save as they go.

**New records**

- Open the very same page, empty except for sensible defaults: today's date, the first status, the current filter's values.

**Sections below the fields**

- **Notes.**
- **Intelligence:** what Alpha knows about this record, and what acted on it. Remembered facts can be corrected or forgotten, and each has a **Provenance** disclosure showing its source and when it was seen.
- **Governance:** where each value came from, when, and what Alpha may do with this record.
- The person chooses which sections each collection shows, from the data view's **⋮ More**.
- Each section is a card with a small sans-serif title, an (i) tip saying what it is, and its content.
- Empty sections say so in one sentence: "No notes yet."

---

## 8. Projects

**Each project has:**

- its own icon;
- a name;
- a one-line description (used on its Home card).

**Pre-built projects**

Task manager and Network are shipped on install. That is all "pre-built" means: they are ordinary projects, renamed, moved, hidden, edited or deleted like any other.

**Task manager**

- The one to-do list for the workspace: a Queue of tasks shaped like a tree (a goal is a task with Goal ticked), with exit tests before starting and evidence before done; assistants propose, the person approves. The full specification is section T of `core-changes-for-the-window.md`.
- It holds the person's and Alpha's tasks.
- Its due items feed Home's Today card.

**Network** (People and Organizations as two tabs; was People & Companies)

- A pre-built project.
- Each person or company record page has:
  - Alpha's editable page about them;
  - their facts;
  - **Might be the same** (likely duplicates);
  - everything in the journal that mentions them.
- Relationship strength shows through colour and position (warm, trusted, dormant, neutral), never as a bare score.

**Nesting**

- A project can hold other projects, to any depth. Breadcrumbs show where it sits, and the project notes "what you ask here reaches them all".
- **Move…** places a project inside another, or back at the top level.
- **A new project above it** creates a parent where the project sits now, then moves the project into it.
- **Move a project in** pulls another project inside this one.
- These controls appear in the sidebar menu and in the project's Governance section.

**Adding a project: describe it, don't design it**

Before building a project, workflow or automation, the assistant **confirms the goal**: it restates the objective in one sentence and, if anything is ambiguous, asks one or more short questions as question cards (§9). If the request is already explicit, it skips this step and builds.

1. A name, an icon, a one-line summary and a short description.
2. Its collections and each collection's fields (text, number, date, status, person, file, link to another record…), plus which status maps to which of the five chip tones.
3. Which collection opens first and, optionally, default views (for example, a board grouped by stage, or a dashboard).
4. Two to five metrics for its metrics strip.
5. What Alpha does here (agents and automations as plain triggers, such as "when a job is saved"), and its governance rules, each with a one-sentence reason.
6. Optionally, a domain word to replace "Record".

The project then appears in the sidebar, gets a Home card, and renders through the standard page, data views, record pages and below-the-fold sections.

**Custom content** goes into the metrics strip, a slim notice above the table, the dashboard, or extra section cards on record pages. The standard layout is the default; a project gets a different layout only when the person explicitly asks for one.

---

## 9. The assistant panel

**Presence**

- Always present. Every avatar shows the whole companion, never a zoomed-in crop of its face (the owner, 11 Oct). When folded, it is a slim strip showing the assistant's avatar (with eyes) and its name beneath, then the bell.
- By default, it follows the page: a project page opens that project's conversation.

**Header**

- The fold control on one side; the assistant's avatar and name centred; the **notifications bell** (Activity) at the right end.
- Just below sits a compact history picker for conversations, a **+** to start one, and a **⋮** holding Rename, Archive and Delete (Delete confirms) (the owner, 11 Oct).
- A strip of live conversations lets several run side by side. **Done** closes one; what it learned stays.

**Messages**

- The person's messages: dark ink bubbles on the right.
- The assistant's messages: light bubbles on the left.
- Under each assistant turn:
  - a small grey source line saying who answered, what ran and which records and files were used, each linked;
  - small status tags;
  - **Stop** and **Retry** when relevant.

**Composer**

- One rounded box. A borderless text area that grows as you type sits above a row with attach, depth, microphone and a round send button.
- **Depth:** **Quick overview** (the default) or **Deep thinking**. The person picks how deep, never a model or a speed. Model choice lives in Settings › Thinks with.
- A quick answer ends by offering to go deeper where that would help.
- **Enter** sends; **Shift+Enter** adds a new line.
- Typing **@** offers other agents to address.
- If a send is lost, the words come back to the box.
- Buttons elsewhere in the app can place a sentence in the composer for the person to finish.

**Empty conversation**

- One short, quiet line saying what the assistant can do here.

**Structured steps**

- Questions, plans and build progress appear as tidy cards in the conversation, built from the same buttons and tags as the rest of the product.
- Questions offer choice pills, plus "Or say it your way". They are how the assistant confirms the goal: **ask when it's ambiguous, act when it's clear.**
- Builds and deep research show their steps (done and failed marked with icons and words) and the current step in plain words, and offer **Stop**. Completion is stated plainly and links to the result.

### Human approves

Every assistant action is a **proposal** with **Approve** and **Decline**. The card shows:

- the task;
- the expected outcome;
- how success will be judged.

**Action cards** for anything that leaves the workspace also show:

- the exact text that would be sent;
- a screenshot of the dry run;
- what the action reaches: "Stays in your account; reaches nobody" or "Reaches someone: it asks every time";
- how to undo it, or that it cannot be undone.

The person can edit the payload before approving.

**Approve once, not every step.** A plan is approved as a whole; its routine steps then run without asking again. Steps that leave the workspace, delete or can't be undone still ask.

**Always allow** turns an approval into a standing permission for that kind of action. After the person approves the same kind of action a few times, the card suggests Always allow. Standing permissions are listed, and can be revoked, in Second Brain and in the project's Governance section.

When a request would share data with an outside service, an amber notice asks first and shows exactly what will be shared.

---

## 10. The companion

- An optional, always-on-top character that shows what Alpha is doing: idle, listening, working, or needs you.
- **Bubble:** carries at most one line and one action.
- **Quick ask:** a click opens a small panel to say or type one thing.
- **Hand-off:** anything that needs the full window opens the workspace at the right place.
- **Settings:** the person picks its look and size there.
- **Tone:** friendly but quiet, with the same words and the same approvals as the window.

---

## 11. Home

The one place where everything important and urgent shows, as cards (the owner, 12 Oct). A header like every page's: the greeting (serif) and today's date on the left, the next event from the connected calendar on the right (when and what; "No events coming up" otherwise).

0. **Setting up** (only until it's done; only on Home) (the owner, 11 Oct): a quiet card for what Alpha still needs (the account it thinks with, the browser it reads with), each with its one button. It never appears on any other page.
1. **The card grid**
   - Columns as many as fit at 280px or wider; one row unit (128px); one gap. A card is **S** (1 row), **M** (2) or **L** (3) high, and **wide** (2 columns) only when it has many items. Content never grows a card: extra items fold into "N more", which opens the card's page.
   - **Every card has a purpose, written as its title** ("Answer 3 things so Alpha can go on", "Fix 2 things that didn't work"), and **every item has its action** (Approve, Try again, Prepare, Open, Next step). A card with nothing to act on is not shown.
   - **Alpha decides the cards** — which, how big, and how each is presented (decision list, number, timeline, preview…) from what it is for. Until the core composes Home (core-changes G10), the window builds them by a fixed rule: what needs a yes, what broke, today's events, Alpha's guesses to check, what Alpha is working on, active goals, what got done, then one S card per project and **Start something new**.
   - Most urgent first, top-left; dense packing fills holes, but the reading order stays the priority order.
   - A need that doesn't fit one line (a plan with questions, an action card) shows **Review**, which opens **Needs you** in full (`#/needs`).
   - **Quiet day:** one sentence, "Nothing needs you right now."; the projects still show.
   - **Errors:** a part that can't load says so in plain words with **Try again**; the rest still shows.
2. **First steps** (a new workspace only): a few one-click starts, each saying what will happen.

---

## 12. Intelligence

The one place for everything Alpha knows and can do across projects. Its header tabs are:

- **Second Brain** (the owner, 12 Oct)
  - **Graph** (the default; Obsidian's graph view as the reference): every thing in the platform as a node — you, projects, collections, records, people, organisations, facts, hypotheses, goals, agents, automations, skills, connections — and every link the data holds; suggested links and hypotheses dashed. The legend is the kind filter (each chip shows or hides a kind, with its count). Search finds and centres; Filter hides things with no links; ⋮ has names and Refresh. Hover lights the neighbours; a click selects and opens the side panel (links, ✓ / ✕ for a hypothesis, Open page, the local graph 1–3 links around it); a double-click opens the page.
  - **Table:** facts, goals and hypotheses in one standard data view with a Type column. A **fact** is what is known; a **goal** what you want; a **hypothesis** what Alpha thinks is true and you haven't decided. A hypothesis row shows **✓** (Keep as a fact / Make it a goal) and **✕** (Reject) on hover or focus.
  - Each project's Intelligence section has the same table for that project: its goals, and the facts and hypotheses about whom its work names.
  - Every fact, goal, standing permission and note opens a page of its own.
  - Under the views: standing instructions, standing permissions and Alpha's notes, each an editable sentence.
- **Agents and automations** (one tab since 9 Oct, owner's third review)
  - Alpha and every agent, then every automation, in the standard data view.
  - **One New button** (no Add agent / Add automation): it asks Alpha to build what's needed, deciding between an automation (fixed steps, no model) and an agent (owns a recurring process, uses judgement), and asking the person, with the trade-offs, when unclear.
  - **Each agent has its own page** showing what it does, its skills, its runs and its permissions.
  - Each automation is a sentence with its trigger, its next run and an on/off switch, and its own page with **Run now** and its runs.
- **Skills**
  - What Alpha can do, each in plain words.
  - Each has its own page with how it works, Alpha's notes and its runs.
- **Connections**
  - Every app, folder, site and calendar Alpha can reach, with its state (Working, Needs your sign-in, Being repaired, Blocked) and which projects use it.
  - Removing a connection states what goes with it before you confirm.
  - A connection and a fact each open as a full page of their own, never in a pop-up.
- **Activity** (the bell at the right of the assistant's header, not a tab)
  - Everything Alpha did and read, and what the person changed, grouped by day with search first.
  - Each entry opens to what it touched.
- **Graph and Map are different words** (the owner, 12 Oct): a **graph** is things and the links between them (Second Brain); a **map** is places on a world map. Both have small zoom in, zoom out, fit and move buttons in the bottom-right corner, besides the wheel and dragging.

**Every list here is the one data view** (12 Oct, the owner): Agents and automations, Skills, Connections, Facts, Goals, an agent page's skills and automations, and a project's goals, agents and sub-projects. Card-or-list alternatives are the data view's own views (Table by default; List, Gallery, Board…), never a separate UI. A page's actions (**New**, **Add goal**, **Connect**) sit in the toolbar between Filter and ⋮, fold into ⋮ when narrow, and appear nowhere else on the page. Not data views: the graph (a picture), Activity and an agent's Runs (a feed by day), and the editable sentences above.

---

## 13. Settings

**Layout**

- A header with the title in serif and an (i) tip; no subtitle.
- A list of sections on the left, at every window size (it never moves above the cards; the owner, 11 Oct). The active section has an accent wash and a small accent dot. The first is **Overview**, which shows every section's cards on one page; each other section shows only its own.
- Readable cards on the right.
- Section titles are semibold sans-serif with an (i) tip. Field labels are small and sentence case.
- **Each row says what is currently so and offers the one thing to do about it.**
- Unconfigured areas show a dashed card with "Nothing configured yet" and an (i) tip about what will appear there.

**Sections** (default order)

1. **Workspace:** name, initial tile and colour, **Manage Workspace**, **Sign out**.
2. **Thinks with:** the model route (Claude through Claude Code, or ChatGPT through the Codex CLI), whether it is connected, the one step to connect it, and the model behind Quick overview and Deep thinking.
3. **Appearance:** Light, Dark or Match Mac. Motion and contrast follow the Mac. A **Companion** link opens Alpha's agent page, where the companion's look and size are chosen (they are not repeated in Settings).
4. **Reads with:** the browser Alpha reads pages with, whether it is installed, and Install.
5. **Notifications:** what may interrupt, and when.
6. **Permissions:** standing permissions and what each allows, with Revoke.
7. **Builder rules:** how Alpha makes projects (default views, metrics, naming).
8. **Defaults:** rows per page, the sections record pages show, the first view of new collections.
9. **Your data:** where it is kept on this Mac, its size, backups, export of the whole workspace.
10. **Removed projects:** projects that were removed but whose data was kept, with Restore.
11. **Experimental features:** early ideas, one row each: the name, an (i) tip, and a switch. Off by default; kept per window (localStorage `alpha.experiments`, read with `useExperiment(name)`).
12. **Help:** shortcuts, version, how to report a problem.

**Bubbles** (the first experimental feature, 12 Oct). When on, a finished reply can place small round bubbles on the page in the middle: from Alpha's markup `[[bubble: <target text> | <comment>]]` (never shown in the reply) and from quoted or bold names that exactly match something visible (a heading, column, record title, button), with the sentence that named it. A bubble sits at its element's top-right corner, follows it on scroll and resize, and all go when the page changes. Hover or Enter/Space opens it to show its text; scrubbing the pointer back and forth across it (3 turns within 600 ms) or Delete/Escape pops it (a quick scale-and-fade, instant under reduced motion). Each is focusable with an accessible name ("Alpha's note: ..."). Several may show at once.

---

## 14. Shared components and behaviour

**One of each part**

- One button family, one input, one dropdown, one menu, one dialog, one card, one chip, one metric tile and one empty state.
- When something is missing, it is added to the shared kit rather than made as a local variant.
- **One look per function, many ways in** (the owner, 11 Oct): two visual elements that do the same job (two kinds of tab switch, two empty states, two delete buttons) are a defect. The same task may still be reachable several ways (a ⋮, a right-click, a shortcut, a double-click), as long as each way uses the same element.

**Buttons**

- **Primary:** solid accent. At most one per area; the rest live in ⋮.
- **Secondary:** outlined. The most common button.
- **Ghost:** for icon-only and low-emphasis actions.
- **Destructive:** red.
- All buttons are comfortable in size; the most-used are the easiest to hit.

**Dropdowns** (one standard dropdown, not the browser's native select)

Every dropdown, without exception, has three things (the owner, 9 Oct; confirmed 11 Oct):

- **Search** at the top, always.
- **A star** on hover or focus of each option: ★ marks the person's default; clicking ☆ makes that option the default, and Alpha remembers it. Clicking the star never selects.
- **Add new…** pinned at the bottom of every dropdown (the owner, 11 Oct). Where the window can add the option itself, it does. Where it can't (the list is fixed, or adding needs building), Add new… opens a small pop-up where the person describes the new option, and **Send to Alpha** puts it to the builder agent in **this page's conversation** to resolve; Cancel closes it.

And:

- **No tick.** The current choice is a highlighted row; where several can be chosen, every chosen row is highlighted.
- About five rows show, then the list scrolls.
- Choosing something always shows what it did (for example "Rows coloured by Stage").

**Menus and popovers**

- Stay inside the window and never get clipped.
- Close with Escape or a click outside.
- Work fully from the keyboard.
- **One "more" glyph:** ⋮ (vertical), everywhere (the owner, 9 Oct; replaces ⋯). No hamburger menus. Right-click shows the same menu as the ⋮ beside it.
- An item with more choices opens a submenu on hover (**Download ›**).

**Dialogs**

- Used for confirmations and short focused tasks.
- Each has a clear title, one or two sentences on the consequence, and Cancel followed by the main action.
- Never the browser's own alerts, confirms or prompts.

**Deleting**

- **Every delete confirms in a dialog** (the owner, 11 Oct): rows, records, lists, rules, conversations, connections, files, everything. The dialog names what goes and what can't be undone, with Cancel and Delete.
- Delete controls live inside menus or appear on hover; they are never permanently visible.
- A destructive confirmation says exactly what cannot be undone.

**Never hide a command**

- What can't be done right now is shown disabled, with a short reason that hover, keyboard focus or a click reveals, and a pointer to where to make it possible.
- What can be done but has consequences stays enabled, with a warning before it proceeds.

**Saying no**

- When the product refuses, it names the next step and the control to use. For example: "Calendar needs a date field. Add one from ⋮ More › Add column."

**Clickability**

- Anything that looks clickable does something. Otherwise it is plain text.
- **Everything listed has a page.** Any item in a table or list — a record, an activity entry, an agent, an automation, a skill, a connection, a fact — opens a page of its own when clicked.

**Feedback**

- No pop-up toasts.
- A confirmation is a small line of accent text near the action.
- An error is a small red line near the action, or a pale red banner for bigger problems, always with **Try again** where it applies.
- A floating dark pill is used only for background jobs that finish.
- Every click answers at once (visibly within 100ms), even when the work behind it takes longer.
- Errors stay until the person dismisses them or tries again; they never fade on a timer.
- The assistant and the companion speak only when called, or when something needs the person.

**Loading**

- A short grey line that names what is loading ("Loading Deals…"), or a small spinner.
- No skeleton shimmer.
- A failed load says what failed and offers Try again; it is never left as "Loading…" forever.

**Tooltips**

- Short phrases. Any explanation goes in an (i) tip beside the title or the unfamiliar term; never a subtitle (§2).

**Honesty**

- Never show made-up data or placeholder content.
- "Unknown" is a valid answer.
- Never show a score without what it is based on.
- Errors say what went wrong in plain words; no stack traces, status codes, internal words ("core", "502", "Failed to fetch") or commands. While something loads it says so; a load that hasn't finished never reads as empty.
- Errors sit next to the problem, say how to fix it, and keep the person's input.
- Inputs accept dates, numbers and names in any reasonable form and tidy them up; where the options are known, offer choices instead of free typing.

---

## 15. Ergonomics

- The most-used controls are the largest and closest.
- Save sits next to what it saves.
- Related controls are grouped.
- Field sizes match the expected answer.
- Long lists are chunked into groups of about five to seven.
- Familiar patterns come first: Notion, then the Mac's own (Finder, Mail).
- Shortcuts for regulars: ⌘K to search, "/" to insert, multi-select for bulk actions, right-click menus that mirror ⋮.

---

## 16. Accessibility

- Everything can be done from the keyboard. Escape closes, cancels or steps back.
- Focus is always visible as a clear accent outline.
- Every control has a label. Pages have addresses, so Back and Forward work.
- Contrast stays at AA (4.5:1) or better, in light and dark.
- Status is never shown by colour alone; colour is always paired with a word.
- Disabled controls' reasons can be reached by keyboard and screen readers, not only by hovering.
- Text stays at or above the readable minimum (12px). The one exception is the fully folded sidebar's labels (11px, §4), whose full names also show on hover and focus.
- Live updates, such as new messages and finished work, are announced politely to screen readers.

---

## 17. Fixed rules

Everything elsewhere in this rulebook is a default. These are not.

1. Every screen sits in the three-part frame with one shared header line, Home included; nothing sits above a page's header.
2. Settings is always the last sidebar item; New is always the last item in the project list.
3. Never in the sidebar: group headings, a theme switch, status lines, or extra destinations.
4. Section switches, in the header or in the body, are one toggle and never wrap.
5. The toolbar is one row that never wraps, in the standard order, ending at ⋮.
6. The add row is always present (disabled, with a reason, when adding isn't possible).
7. Never hide a command. Disabled controls, including unsupported views, show their reason on hover, focus or click.
8. Serif is used only for the hero heading, record titles, single-section page titles and metric numbers.
9. One accent colour. No gradients and no second accent.
10. Every colour, size and space comes from the named design values.
11. Never animate something in a way that hides it until the animation finishes. Always respect reduced motion.
12. Never use emoji or text symbols as icons.
13. Every delete confirms in a dialog, and delete controls are never permanently visible.
14. Every assistant action is a proposal the person approves (a plan once, as a whole), unless they set a standing permission for it with Always allow.
15. Never show made-up data, a guess as a fact, or a score without its basis.
16. Dates are absolute by default; a relative date always shows the absolute one on hover.
17. No pop-up toasts, no skeleton shimmer, and no browser-native dialogs or selects.
18. Every dashboard visual has a call to action.
19. Never a blank page: an empty project or tab still shows one empty table. No name repeats twice in a row in one flow.
20. One "more" glyph (⋮) everywhere.
21. Red means a problem and nothing else.
22. No text below the readable minimum (12px; the fully folded sidebar's labels 11px), and no tiny letter-spaced capitals.
23. A row click opens its record's full page (no peek) after the short double-click pause; a double-click edits in place.
24. Everything the assistant makes is saved as a file.
25. **Every create has a Cancel** (the owner, 9 Oct, explicitly): a page, dialog or inline box that makes something always offers Cancel beside its create button, and Escape does the same; nothing is made until the create button is pressed.
26. One layout for every table page: the data view over the first screen, then Files, Intelligence and Governance.
27. A column's width never changes on hover.
28. No subtitles: explanations live in (i) tips.
29. One visual element per function; several ways in are fine. A table's "+ New" row shows only when it adds inline; otherwise the toolbar's New is the one way (the owner, 12 Oct).
30. Every dropdown ends in Add new…; what the window can't add goes, described, to the builder agent in this page's conversation.

---

## 18. Final check for every screen

- [ ] Same frame, same header line, same toolbar order and same table behaviour as every other screen.
- [ ] No one-off control, colour, size or icon. Everything comes from the kit and the named values.
- [ ] Serif only in its four places.
- [ ] The reviewer is not the builder: someone other than whoever built a screen checks it against this list.
- [ ] Empty, loading and error states are quiet and honest, and the structure stays intact.
- [ ] Disabled controls are visible, with a reason on hover, focus or click; refusals name the next step.
- [ ] Grouping, alignment and focus are clear at a glance (§19): one section fills the screen, one primary action per area.
- [ ] Text is comfortably large, sentence case, and nothing important is tiny.
- [ ] Assistant-initiated and risky actions wait for Approve.
- [ ] Every dashboard visual has a call to action, and every number states its basis.
- [ ] Wording follows §2: workspace, Second Brain, Connections, dates absolute by default, "Unknown" where unknown, no subtitles (explanations in (i) tips).
- [ ] It passes Nielsen's ten heuristics (§19).
- [ ] Everything works in light and dark, at the window's smallest size (1100×560) and default (1240×820), and from the keyboard. `just check-layout` passes.
- [ ] It feels calm, honest and consistent.

---

## 19. The principles underneath

These are how people see, think and act. They are not style choices, and the rules above rest on them. When a case isn't covered, they decide it.

### How people see (Gestalt)

| Principle | In Alpha |
|---|---|
| **Proximity:** things close together read as one group. | Related controls sit together; space separates unrelated ones. Save sits next to what it saves. A label sits closer to its own field than to the next. |
| **Similarity:** things that look alike are assumed to act alike. | Every button, chip and table looks and behaves the same in every project. Two things that look the same but act differently are a defect. |
| **Common region:** things inside one boundary belong together. | A card is one topic. A record's fields share one card. |
| **Alignment and continuity:** the eye follows edges. | Shared edges and one header line; columns line up; numbers align right. |
| **Figure and ground:** one thing in front, the rest background. | One section fills the screen. Menus and dialogs float above it and dim what is behind. |
| **Simplicity:** people read a scene in its simplest form. | Fewer shapes, colours and lines. A border that isn't needed to show grouping is removed. |
| **Focal point:** the one thing that differs stands out. | Accent and red are rare, so they mean something when they appear. |

### How people think and act

| Principle | In Alpha |
|---|---|
| **Familiarity (Jakob):** people expect what they already know. | Behave like Notion wherever it has a pattern. |
| **Hick:** more choices, slower decisions. | Essential options first; the rest in ⋮. |
| **Chunking (Miller):** a few things at a time. | Long lists and forms come in small, labelled groups. |
| **Cognitive load and Tesler:** some complexity can only be moved. | The platform and the assistant carry it, not the person. Never ask for what the workspace already holds. |
| **Recognition over recall.** | Options, context and recent work stay visible; the assistant restates context. |
| **Mental model.** | The person's words and way of organising work, never the system's internals. One model everywhere: Workspace → Project → Collection → Record → Page. |
| **Serial position:** first and last are remembered. | The most important items go first or last. |
| **Fitts:** bigger, closer targets are easier. | The most-used controls are the largest and nearest. |
| **Doherty:** near-instant response keeps focus. | Every click answers at once. |
| **Postel:** generous in, precise out. | Accept any reasonable date, number or name; tidy it up. |
| **Goal gradient and peak-end.** | Show progress on longer work; end every task with a clear, calm confirmation. |
| **Zeigarnik:** unfinished things nag. | Open items gather in Needs you, not everywhere. |
| **Aesthetic-usability.** | Polish matters, but never hides a broken flow. |

### How things communicate (Norman)

Clickable things look clickable (**signifiers**); every action gets a visible response next to it (**feedback**); actions sit beside their object (**mapping**); invalid actions are designed out, with choices where options are known (**constraints**); and the person can form one simple, correct picture of how it works (**conceptual model**).

### Every screen passes Nielsen's ten

1. Visibility of status. 2. Match the real world. 3. Control and freedom (easy exits and undo). 4. Consistency and standards. 5. Error prevention. 6. Recognition over recall. 7. Flexibility and efficiency. 8. Minimalist design. 9. Help with errors. 10. Help in context.

### The short version

1. Confirm the goal; ask when it's unclear.
2. Work for everyone.
3. Work like Notion.
4. Never leave people wondering.
5. One screen, one purpose.
6. Never invent, hide or surprise.
7. Quick first, deep on request.
8. Propose, then act.
9. Every output is a file.
10. Show the source.
11. Words for goals, controls for adjustments.
12. The platform remembers.
13. Calm, spacious, premium.
14. Defaults first.
15. Plain words.
16. Every record opens; clickable looks clickable.
17. Motion only to explain.
18. Prevent errors; protect work.
19. Greyed out says what's needed.
20. Friction where it protects.
21. Don't interrupt.
22. Shortcuts for regulars.
23. Show the finish line.
24. Help where people get stuck.

The reasons behind each, at length: `Exploration/UX_Guidelines_Platform.md` (v2).
