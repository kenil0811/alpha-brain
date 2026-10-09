# Alpha UI rulebook

## 0. How to read this

Alpha is one calm, honest, consistent product. Every screen is built from the same few parts and arranged in the same few ways, so someone who has learned one screen already knows the next.

**Three pillars**

- **Calm.** Plenty of space, few colours, no visual noise, quiet motion.
- **Honest.** No made-up data and no over-promising. When something is empty, unknown or unavailable, the interface says so plainly.
- **Consistent.** Every area uses the same patterns. Learning one screen means knowing them all.

**How the rules work**

- Rules that say **always** or **never** are fixed. They are collected in §17.
- Everything else is a **default**: the starting point, not the only choice. Inside the defaults, use judgement.
- When a case isn't covered, choose what is most consistent with what already exists.
- Screens that Alpha generates for modules look like they belong to the main window, unless the person explicitly asks for something different.

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
- **Status chips** are pale pills in five tones: green, yellow, red, blue and grey. Every module maps its statuses onto these five.
- **Red** marks errors, overdue items, destructive actions and forced edits (§7).
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
- Labels and eyebrows are tiny, uppercase, letter-spaced and stone grey.
- Weights stay between regular and semibold.
- Digits use tabular figures wherever they line up in a column.
- Every size comes from one type scale of about seven steps.

### Space and shape

- **Spacing:** steps of one base unit. Consistent spacing and alignment count as correctness, not decoration.
- **Corners:**
  - Controls (buttons, inputs, sidebar items) share one radius.
  - Cards, tables, panels and menus share a slightly larger one.
  - Chips, tags and the send button are pills.
  - The chat composer is the roundest element.

### Depth

- The three main columns are separated by soft shadow seams, not hard lines.
- Cards have a border and at most a whisper of shadow.
- Floating things (menus, dropdowns, dialogs) get a soft, clear shadow. Dialogs dim the window behind them.

### Icons

- One thin-line icon family (Lucide by default), at two sizes: small and regular.
- Never use emoji or text symbols as icons.
- Icons are stone grey by default and steel blue when active.
- Each module has its own icon, chosen when it is made and changeable later.

### Motion

- Short, quiet ease-outs for changes of state: hover fades, a panel changing width, a chevron turning, a spinner while working.
- Never animate something in a way that hides it until the animation finishes.
- No bounces, no page transitions, no decorative animation.
- Always respect the Mac's reduced-motion and increased-contrast settings.

---

## 2. Words

**Tone:** calm, literal, precise and modest. Explain consequences; never hype.

**Core vocabulary**

| Use | Instead of |
|---|---|
| Workspace | organization, account |
| Module, sub-module | app, project, package |
| Page, View, List, Section | screen, tab-page |
| Record, Field, Relation | item, element, entry |
| Second Brain | memory, knowledge, brain |
| Connections | integrations, apps |
| Agent, Skill, Automation | bot, tool, workflow |
| Approve / Veto | accept / reject (for proposals) |

A module may rename "Record" to its own word, such as Deal, Task or Application.

**Habits**

- Labels are in sentence case. Product nouns keep their capitals: Home, Second Brain, Connections, Intelligence.
- Use real ellipses (…), em dashes (—) and arrows (→) on links.
- Empty states use "yet": "No files are attached yet."
- **Dates are always absolute:** "8 Oct 2026" or "8 Oct, 14:30". Never "2 days ago".
- A value nobody knows reads **"Unknown"**. Unknown is a valid answer; a guess is never shown as a fact.
- Never say "Coming soon". Something unavailable is disabled, with a reason (§14).

**Good examples**

- "Nothing needs you right now."
- "Record that the introduction happened? This does not send a message."
- "Your invoices will appear here once a billing provider is connected."

---

## 3. The window frame

Every screen lives inside the same three-part frame:

**Sidebar | Main area | Assistant panel**

- **One header line.** The sidebar's top row, every page's header and the assistant's header share one height, so their bottom edges form a single line across the window.
- **No separate title bar.** The sidebar's top row doubles as the Mac's title bar, beside the window controls.
- **Panel widths.** Each side panel has three widths: normal, wide and folded.
  - Drag the inner edge to resize. The handle appears only on hover or keyboard focus.
  - A folded panel never disappears. It shrinks to a narrow strip; clicking the strip opens it again.
  - Escape steps a panel back one level: wide → normal → folded.
  - Sizes and folded states are remembered.
- **Connection problems.** When Alpha's core stops answering, a slim notice at the top of the main area says what is wrong and offers **Try now**. When the core comes back, a quiet line says so. Otherwise nothing about the runtime is shown.

---

## 4. The sidebar

**Contents, top to bottom**

1. **Workspace button:** a coloured initial tile and the workspace name. Its menu holds the workspaces, **Manage Workspace** and **Sign out**.
2. **Home**, with a small count of what needs the person.
3. **Task manager**, always the first module.
4. **The person's other modules,** in their own order. Child modules fold out beneath their parent, indented, behind a chevron.
5. **New**, always the last item in the list.
6. Pinned to the bottom: **Intelligence**, then **Settings**. Settings is always the very last item.

**Behaviour**

- Only the module list scrolls. The pinned bottom items never move.
- **Current item:** a soft accent wash, steel text and icon, and a short accent bar on its left edge.
- **Folded:** each item shows its icon with a tiny label underneath.
- **Reorder:** drag modules up, down, or into another module.
- **Right-click a module** (or use its ⋯ on hover) for:
  - Open
  - Rename (edits the name in place)
  - Change icon
  - Move…
  - Hide
  - Delete
  - View options
- **Hide** removes a module from the sidebar only. Hidden modules come back from **View options** in the same menu.
- **Delete** asks which of three things the person means:
  - remove the module but keep its data;
  - remove the module and its data;
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

- When a surface has several sections, the header holds a centred, pill-shaped switch with one tab per section: small uppercase labels with icons, and the active tab raised.
- When there is only one section, the header shows its title in serif.
- Switches never wrap onto a second line. When space runs short, they drop to icons only.
- Section switches always live in the header, never in the page body.

**Body**

- On data pages, the collection fills the first screen.
- Opening a module lands on its data, never on a description of the module.
- By default, the first tab is the first collection; for the Task manager, it is the task list.

**Below the fold**

- Sections appear in this order as the person keeps scrolling: **Files**, then **Intelligence**, then **Governance**.
  - Intelligence holds what Alpha does here, its activity, and Alpha's editable page about the module.
  - Governance holds where things are kept, where they are read from, what runs on its own, and what Alpha may and may not do here, each rule with a one-sentence reason.
- Scrolling from the table into these sections feels continuous. The scroll is never trapped inside the table.

**Structure follows the data**

- Different slices of one collection are Lists or Views of that collection, not new pages.
- Linked collections in one module become sibling tabs in the header.
- Closely related but unlinked areas become sub-modules.
- Unrelated areas become separate modules.
- Every record has its own page (§7).

---

## 6. Collections: one standard data view

Every collection, everywhere, is shown through one shared data view. Pages don't hand-build their own table, toolbar or filter.

### Toolbar

One row that never wraps, in this order:

**Saved list · View · Search · Filter · page actions · ⋮ More**

- **Saved list:** "All", plus the person's saved lists, with **Add list** pinned at the bottom.
  - A list can be starred as the one the collection opens on.
  - Lists are kept in the workspace, so Alpha can make them too.
- **View:** the view types in the next section.
  - Views the data can't support stay visible but disabled. The reason appears on hover, for example "Calendar needs a date field".
- **Search:** quietly narrows the visible rows. Search is never saved as a list.
- **Filter:** every filtering choice in one place.
  - Active filters appear as small removable pills under the toolbar, with **Clear all**.
  - The **Hide done** and **Show gone** toggles live in Filter.
- **Page actions:** at most one primary action. Defaults are **Add files** and **Export**.
- **⋮ More** holds:
  - Sort
  - Add column
  - Column visibility and order
  - Frozen columns
  - Footer summaries
  - Which sections record pages show
  - Download as CSV or Excel
  - Save filters to this list
  - Reset view
- **Narrow windows:** labels collapse to icons first, then Filter moves inside More.

### View types

Table (the default) · List · Board · Calendar · Timeline · Gallery · Chart · Form · **Dashboard**

- Every view uses the same toolbar and the same open, edit and add behaviour. Only the layout of the records changes.
- **Board:** quiet columns with uppercase headers and counts. Cards can be dragged between columns. It groups by a status or choice field, with a picker when there are several.
- **Calendar, Timeline and Chart:** run on a date field, with a picker when there are several. Grids are faint. Charts use a restrained palette and always show a legend.
- **Form:** one record at a time, with Previous and Next.

### Dashboard view

A page of visuals where **every visual is actionable**.

- **Visual = something to do.** Each tile pairs a visual with a call to action (CTA). If a tile has nothing to act on, it says so in one line ("Nothing overdue.") and its CTA stays visible but disabled, with the reason on hover.
- **Tile types:**
  - **Metric:** a serif number, what it is based on, and a CTA such as "Show these 12".
  - **Breakdown by status or choice:** clicking a segment opens those records.
  - **Over time:** by a date field. Clicking a bar or point opens those records.
  - **Needs attention:** up to 5–7 records (overdue, stale, missing a value, flagged), each with its own inline action.
  - **Progress toward a goal:** the module's goals, with the next step.
  - **Alpha's suggestions for this collection:** each shown as a proposal with Approve and Veto.
- **What a CTA does:**
  - opens the collection in another view, filtered to exactly those records (a temporary filter, savable as a list);
  - opens a record page;
  - starts a bulk action, confirmed in a dialog;
  - or puts a sentence in the assistant's composer.
- **Context:** the saved list, search and filters in the toolbar apply to every tile.
- **Layout:** by default, Alpha picks 4–7 tiles from the collection's fields. The person adds, removes, reorders and resizes tiles from **⋮ More › Edit dashboard**. The layout is saved with the list.
- **Every number states its basis.** "Average deal size · 14 deals with an amount" — never a bare score.
- **Available when** the collection has at least one number, status, choice or date field. Otherwise it is disabled, with "Dashboard needs a number, status or date field".
- **Module dashboard (optional):** a module can open on a dashboard spanning all its collections, if the person chooses. It follows the same rules.

### Table

**Container and header**

- A rounded, bordered container.
- A quiet header row with small uppercase labels and faint lines between columns.

**Rows**

- Evenly spaced and compact by default, with a taller option.
- A soft highlight on hover. Selected rows keep the highlight.
- Numbers are right-aligned. Statuses show as tinted pills.

**Columns**

- Resizable, reorderable and freezable.
- A checkbox column on the left selects several rows.

**Opening and editing**

- Clicking anywhere on a row opens that record's page.
- **Double-clicking a cell edits it in place.** Clicking away saves; Escape cancels. Enter or F2 also starts editing from the keyboard. ⌘Z and ⇧⌘Z undo and redo recent cell edits.
- **Provenance marks:**
  - ≈ for a value Alpha estimated;
  - ? for a value resting on an assumption.

  Hover says why, and double-clicking corrects it. The page bar counts how many rows rest on an estimate or an assumption.
- **Relations** show as pills that open the related record's page.
- **File cells** open the file, or show it in Finder.
- **Seen column:** collections fed by a reader can show when each row came and went ("New today", "Since 2 Oct", "Gone 5 Oct").

**Right-click menus** (each one also reachable from the keyboard)

- **Column heading:** sort, filter by this column, hide, freeze, move, footer summary, rename field.
- **Cell:** edit, copy, clear, reset to computed value, show history.
- **Row:** Open, Edit, Duplicate, Pin, Delete. The same actions are on the ⋯ button that appears at the row's end on hover.

**Add row**

- A row at the bottom adds a record, and it is always there.
- Typing a sentence into it asks Alpha to fill the fields. Alpha keeps the sentence as the record's source and says what it assumed.
- When adding isn't possible, the row stays visible, disabled, and explains why.

**Footer**

- Each column picks its own summary: none, count, sum, average, minimum, maximum, earliest, latest or percent filled.

**Empty table**

- Keeps its full structure: the header, a few blank rows, the add row and the footer.

**Page bar**

- Reads "Showing 1 to 50 of 312".
- A page-size choice, with "Fit to window" as the default.
- First, Previous, Next and Last.
- Inline status lines for what just happened.

**Selection**

- Selecting rows shows a slim bar above the table with the count, plus actions such as Duplicate, Delete and Cancel.
- Delete confirms in a dialog that says what happens.

### Metrics strip

- A collection's headline numbers sit in one compact strip of small metric tiles above the table.
- Each tile has a tinted icon square, a tiny uppercase label, a serif number and what it is based on.
- A small chevron hides or shows the strip.
- Tiles that need attention get a red-tinted icon.

### Files

- **Add files** on the toolbar opens the Mac's file picker. Files can also be dropped anywhere on a module page; a quiet overlay says where they will go.
- Alpha reads added files into the module's collections and says what it did.

---

## 7. Record pages

Every record opens as a full page of its own.

**Sticky header**

- A back link.
- A breadcrumb trail: module › page › record.
- **⋮ More**, holding:
  - Duplicate
  - Pin
  - History
  - Delete

**Body**

- One centred, readable column.
- The record's title in serif, with a small uppercase eyebrow naming the record type and a line icon for that type.
- A card holding all the record's fields, each one labelled.

**The page is the form**

- Every field is editable on the page.
- Field sizes match the expected answer: short inputs for short values, a text area for long text, date and number inputs for dates and numbers.
- **Save and Discard sit together,** next to the fields they save. Nothing is written until Save.
- Leaving with unsaved changes asks whether to save, discard or stay.

**Forced edits**

A forced edit is a value that departs from the field's norm:

- it overrides a computed or automatically filled value;
- it isn't one of the field's choices;
- it falls outside the usual range;
- or it doesn't match the field's type.

A forced edit is allowed. Its text shows in red, with a short note on hover ("Overrides the computed value 1,240"). It stays editable, and **Reset to computed value** sits in the field's menu.

**History** (⋮ More › History)

- Every change to the record, newest first.
- Each entry shows who made it (you, Alpha, or a named automation or agent), the old and new value, and the absolute date and time.
- **Undo** and **Redo** step through the history. An undone change goes into the form, and Save writes it.

**New records**

- Open the very same page, empty except for sensible defaults: today's date, the first status, the current filter's values.

**Sections below the fields**

- **Notes.**
- **Intelligence:** what Alpha knows about this record, and what acted on it. Remembered facts can be corrected or forgotten, and each has a **Provenance** disclosure showing its source and when it was seen.
- **Governance:** where each value came from, when, and what Alpha may do with this record.
- The person chooses which sections each collection shows, from the data view's **⋮ More**.
- Each section is a card with a small sans-serif title, a one-line grey subtitle saying what it is, and its content.
- Empty sections say so in one sentence: "No notes yet."

---

## 8. Modules

**Each module has:**

- its own icon;
- a name;
- a one-line description (used on its Home card).

**Task manager**

- Always the first module, and always present.
- It holds the person's and Alpha's tasks.
- Its due items feed Home's Today card.

**People & Companies**

- A built-in module by default.
- Each person or company record page has:
  - Alpha's editable page about them;
  - their facts;
  - **Might be the same** (likely duplicates);
  - everything in the journal that mentions them.
- Relationship strength shows through colour and position (warm, trusted, dormant, neutral), never as a bare score.

**Nesting**

- A module can hold other modules, to any depth. Breadcrumbs show where it sits, and the module notes "what you ask here reaches them all".
- **Move…** places a module inside another, or back at the top level.
- **A new module above it** creates a parent where the module sits now, then moves the module into it.
- **Move a module in** pulls another module inside this one.
- These controls appear in the sidebar menu and in the module's Governance section.

**Adding a module: describe it, don't design it**

1. A name, an icon, a one-line summary and a short description.
2. Its collections and each collection's fields (text, number, date, status, person, file, link to another record…), plus which status maps to which of the five chip tones.
3. Which collection opens first and, optionally, default views (for example, a board grouped by stage, or a dashboard).
4. Two to five metrics for its metrics strip.
5. What Alpha does here (agents and automations as plain triggers, such as "when a job is saved"), and its governance rules, each with a one-sentence reason.
6. Optionally, a domain word to replace "Record".

The module then appears in the sidebar, gets a Home card, and renders through the standard page, data views, record pages and below-the-fold sections.

**Custom content** goes into the metrics strip, a slim notice above the table, the dashboard, or extra section cards on record pages. The standard layout is the default; a module gets a different layout only when the person explicitly asks for one.

---

## 9. The assistant panel

**Presence**

- Always present. When folded, it is a slim strip showing the assistant's avatar.
- By default, it follows the page: a module page opens that module's conversation.

**Header**

- The fold control on one side; the assistant's avatar and name centred.
- Just below sits a compact history picker for conversations, with small actions to start, archive and delete them.
- A strip of live conversations lets several run side by side. **Done** closes one; what it learned stays.

**Messages**

- The person's messages: dark ink bubbles on the right.
- The assistant's messages: light bubbles on the left.
- Under each assistant turn:
  - a tiny grey provenance line saying who answered, what ran and which records were used;
  - small status tags;
  - **Stop** and **Retry** when relevant.

**Composer**

- One rounded box. A borderless text area that grows as you type sits above a row with attach, model choice, microphone and a round send button.
- **Enter** sends; **Shift+Enter** adds a new line.
- Typing **@** offers other agents to address.
- If a send is lost, the words come back to the box.
- Buttons elsewhere in the app can place a sentence in the composer for the person to finish.

**Empty conversation**

- One short, quiet line saying what the assistant can do here.

**Structured steps**

- Questions, plans and build progress appear as tidy cards in the conversation, built from the same buttons and tags as the rest of the product.
- Questions offer choice pills, plus "Or say it your way".
- Builds show their steps with ✓ and ✗, and offer **Stop**.

### Human approves

Every assistant action is a **proposal** with **Approve** and **Veto**. The card shows:

- the task;
- the expected outcome;
- how success will be judged.

**Action cards** for anything that leaves the workspace also show:

- the exact text that would be sent;
- a screenshot of the dry run;
- what the action reaches: "Stays in your account; reaches nobody" or "Reaches someone: it asks every time";
- how to undo it, or that it cannot be undone.

The person can edit the payload before approving.

**Always allow** turns an approval into a standing permission for that kind of action. Standing permissions are listed, and can be revoked, in Second Brain and in the module's Governance section.

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

A single centred column with room to breathe, and no page header bar.

1. **Heading block**
   - a small accent eyebrow with today's date;
   - a large serif greeting;
   - one line of supporting text.
2. **Today card**
   - **Side-by-side tiles:**
     - **Needs you:** the count.
     - **Due:** overdue, due today and upcoming, from the Task manager. Overdue turns red only when it has items.
     - **Done today:** what Alpha read, made and changed, with failures named.
     - **Coming up:** the next calendar item.
   - **Needs you, in full:** questions to answer, proposals and action cards to approve or veto, and suggested facts to remember or forget.
   - **Alpha is working on:** live work with its current step, and Open and Stop.
   - **Suggestions:** what Alpha noticed, with Approve and Veto.
   - **Quiet day:** the card says so in one sentence: "Nothing needs you right now."
   - **Errors:** if part of the card can't load, that part says what went wrong in plain words and offers **Try again**. The rest of the card still shows.
3. **Modules grid**
   - Each card shows the module's icon, name, one-line description and **Open →**.
   - The last card is **New**.
4. **First steps** (a new workspace only)
   - A few one-click starts, such as connecting a folder or a calendar, or making a first module.
   - Each says what will happen.

---

## 12. Intelligence

The one place for everything Alpha knows and can do across modules. Its header tabs are:

- **Second Brain**
  - Facts about the person and their world, shown as a standard data view, with "Waiting for your confirmation" items above it.
  - Every fact can be corrected or forgotten, and has a **Provenance** disclosure.
  - Also holds goals, standing instructions, standing permissions and Alpha's notes, each as an editable sentence.
- **Agents**
  - Cards for the assistant and each module's runner, in the same style as Home's module cards.
  - **Each agent has its own detail page** showing what it does, its skills, its runs and its permissions.
- **Automations**
  - Each one is a sentence with its trigger, its next run and an on/off switch.
  - Each has its own page with **Run now** and its runs.
- **Skills**
  - What Alpha can do, each in plain words.
  - Each has its own page with how it works, Alpha's notes and its runs.
- **Connections**
  - Every app, folder, site and calendar Alpha can reach, with its state (Working, Needs your sign-in, Being repaired, Blocked) and which modules use it.
  - Removing a connection states what goes with it before you confirm.
- **Activity**
  - Everything Alpha did and read, and what the person changed, grouped by day with search first.
  - Each entry opens to what it touched.
- **Map**
  - The workspace as a graph: the person's world by default, Alpha's own work as a toggle.
  - Suggested links appear dashed until the person decides.
  - It refreshes when asked.

Rows in Automations, Skills and Connections share one layout: an icon, a title, a one-line description and controls aligned to the right.

---

## 13. Settings

**Layout**

- A header with an icon tile, the title and a one-line subtitle.
- A list of sections on the left. The active section has an accent wash and a small accent dot.
- Readable cards on the right, in a centred, moderately narrow column.
- Section titles are semibold sans-serif with a grey subtitle. Field labels are tiny and uppercase.
- **Each row says what is currently so and offers the one thing to do about it.**
- Unconfigured areas show a dashed card with an icon, "Nothing configured yet" and one honest sentence about what will appear there.

**Sections** (default order)

1. **Workspace:** name, initial tile and colour, **Manage Workspace**, **Sign out**.
2. **Thinks with:** the model route (Claude through Claude Code, or ChatGPT through the Codex CLI), whether it is connected, the one step to connect it, and the default model.
3. **Appearance:** Light, Dark or Match Mac. Motion and contrast follow the Mac.
4. **Companion:** on or off, its look, its size.
5. **Notifications:** what may interrupt, and when.
6. **Permissions:** standing permissions and what each allows, with Revoke.
7. **Builder rules:** how Alpha makes modules (default views, metrics, naming).
8. **Defaults:** rows per page, the sections record pages show, the first view of new collections.
9. **Your data:** where it is kept on this Mac, its size, backups, export of the whole workspace.
10. **Removed modules:** modules that were removed but whose data was kept, with Restore.
11. **Help:** shortcuts, version, how to report a problem.

---

## 14. Shared components and behaviour

**One of each part**

- One button family, one input, one dropdown, one menu, one dialog, one card, one chip, one metric tile and one empty state.
- When something is missing, it is added to the shared kit rather than made as a local variant.

**Buttons**

- **Primary:** solid accent. At most one per area.
- **Secondary:** outlined. The most common button.
- **Ghost:** for icon-only and low-emphasis actions.
- **Destructive:** red.
- All buttons are compact.

**Dropdowns** (one standard dropdown, not the browser's native select)

- The selected option comes first, marked with a check.
- Long lists can be searched.
- About five rows show, then the list scrolls.
- **Add…** is pinned at the bottom where adding makes sense.

**Menus and popovers**

- Stay inside the window and never get clipped.
- Close with Escape or a click outside.
- Work fully from the keyboard.

**Dialogs**

- Used for confirmations and short focused tasks.
- Each has a clear title, one or two sentences on the consequence, and Cancel followed by the main action.
- Never the browser's own alerts, confirms or prompts.

**Deleting**

- Delete is never one click.
- Delete controls live inside menus or appear on hover; they are never permanently visible.
- A destructive confirmation says exactly what cannot be undone.

**Never hide a command**

- What can't be done right now is shown disabled, with a short reason on hover.
- What can be done but has consequences stays enabled, with a warning before it proceeds.

**Saying no**

- When the product refuses, it names the next step and the control to use. For example: "Calendar needs a date field. Add one from ⋮ More › Add column."

**Clickability**

- Anything that looks clickable does something. Otherwise it is plain text.

**Feedback**

- No pop-up toasts.
- A confirmation is a small line of accent text near the action.
- An error is a small red line near the action, or a pale red banner for bigger problems, always with **Try again** where it applies.
- A floating dark pill is used only for background jobs that finish.

**Loading**

- A short grey line that names what is loading ("Loading Deals…"), or a small spinner.
- No skeleton shimmer.
- A failed load says what failed and offers Try again; it is never left as "Loading…" forever.

**Tooltips**

- Short phrases. Longer explanations go in an info tip beside the title.

**Honesty**

- Never show made-up data or placeholder content.
- "Unknown" is a valid answer.
- Never show a score without what it is based on.
- Errors say what went wrong in plain words; no stack traces or internal commands.

---

## 15. Ergonomics

- The most-used controls are the largest and closest.
- Save sits next to what it saves.
- Related controls are grouped.
- Field sizes match the expected answer.
- Long lists are chunked into groups of about five to seven.
- Familiar patterns come first: spreadsheet, Finder, Mail.

---

## 16. Accessibility

- Everything can be done from the keyboard. Escape closes, cancels or steps back.
- Focus is always visible as a clear accent outline.
- Every control has a label. Pages have addresses, so Back and Forward work.
- Contrast stays at AA (4.5:1) or better, in light and dark.
- Status is never shown by colour alone; colour is always paired with a label or position.
- Text stays at or above a readable minimum. The exceptions are tiny uppercase labels in table headers, metric labels and the folded sidebar.
- Live updates, such as new messages and finished work, are announced politely to screen readers.

---

## 17. Fixed rules

Everything elsewhere in this rulebook is a default. These are not.

1. Every screen sits in the three-part frame with one shared header line.
2. Task manager is always the first module; Settings is always the last sidebar item; New is always the last item in the module list.
3. Never in the sidebar: group headings, a theme switch, status lines, or extra destinations.
4. Section switches live in the header and never wrap.
5. The toolbar is one row that never wraps, in the standard order, ending at ⋮.
6. The add row is always present (disabled, with a reason, when adding isn't possible).
7. Never hide a command. Disabled controls, including unsupported views, show their reason on hover.
8. Serif is used only for the hero heading, record titles, single-section page titles and metric numbers.
9. One accent colour. No gradients and no second accent.
10. Every colour, size and space comes from the named design values.
11. Never animate something in a way that hides it until the animation finishes. Always respect reduced motion.
12. Never use emoji or text symbols as icons.
13. Delete is never one click and never permanently visible.
14. Every assistant action is a proposal the person approves, unless they set a standing permission for it with Always allow.
15. Never show made-up data, a guess as a fact, or a score without its basis.
16. Dates are always absolute.
17. No pop-up toasts, no skeleton shimmer, and no browser-native dialogs or selects.
18. Every dashboard visual has a call to action.

---

## 18. Final check for every screen

- [ ] Same frame, same header line, same toolbar order and same table behaviour as every other screen.
- [ ] No one-off control, colour, size or icon. Everything comes from the kit and the named values.
- [ ] Serif only in its four places.
- [ ] Empty, loading and error states are quiet and honest, and the structure stays intact.
- [ ] Disabled controls are visible, with a reason on hover; refusals name the next step.
- [ ] Assistant-initiated and risky actions wait for Approve.
- [ ] Every dashboard visual has a call to action, and every number states its basis.
- [ ] Wording follows §2: workspace, Second Brain, Connections, absolute dates, "Unknown" where unknown.
- [ ] Everything works in light and dark, at the window's smallest size, and from the keyboard.
- [ ] It feels calm, honest and consistent.
