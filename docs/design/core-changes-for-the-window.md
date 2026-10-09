# Changes the window needs from the core

*Written 9 October 2026, branch `feat/ui-rulebook`. For whoever builds the core side. No other
context is assumed.*

## Background, in five lines

Alpha is a desktop app (a "second brain"): a **core** (Python, `core/`, served on a local port
with routes under `/api/…`) holds the data and runs the assistant; the **window** (React,
`desktop/src`) shows it and talks to the core only through `desktop/src/core/client.ts`. On this
branch the window was rebuilt to a UI rulebook (`docs/design/ui-rulebook.md`) **without touching
the core**. Where a rule needed something the core doesn't offer, the window shows the control
**disabled, with the reason on hover** (for example "Renaming a project needs Alpha's core"), or
does the nearest honest thing. This document lists each of those gaps: what the person sees now,
what it should do exactly, and what the core must provide.

Words used: a **project** (called `module` in the code and the store) holds **collections**
(tables) of **records** (rows) with **fields** (columns). Projects can sit inside projects
(sub-projects). **Network** is the built-in place for people and organisations. **Intelligence**
holds what Alpha knows (Second Brain: facts, goals), its Agents, Automations, Skills and
Connections. A **proposal** is something the assistant wants to do, shown as a card the person
approves or declines.

Each item: **Now** (what the window does today) · **Should** (exact behaviour) · **Core needs**.

---

## A. Projects and the workspace

### A1. Rename a project
- **Now:** Rename in a project's sidebar menu is disabled ("needs Alpha's core"). Because a
  project and its first collection often share a name, the window showed "Deals › Deals"; it now
  hides the repeat, but the data still has the duplicate.
- **Should:** Rename edits the name in place in the sidebar (Enter saves, Escape cancels). The
  new name shows everywhere at once (sidebar, header, breadcrumbs, Home card, the brain view).
  An empty name or one already used by a sibling project is refused beside the field, with the
  reason.
- **Core needs:** a route to rename a project (journaled, conditional on the current revision),
  and a refusal for an empty or sibling-duplicate name.

### A2. The assistant never repeats a name within one flow
- **Now:** the assistant may create a collection named like its project ("Deals" inside
  "Deals"), or a list or sub-project with the same name as its parent.
- **Should:** when the assistant creates a project, collection, list or sub-project, it never
  gives it the same name as the thing that holds it, or a sibling's name. Different projects may
  reuse a name ("Sources" in Deals and in Network). If the person asks for a duplicate, the
  assistant suggests a distinct name and asks.
- **Core needs:** a check in the tools that create these (`module_create`, collection and list
  creation) that refuses a parent or sibling duplicate with a plain `Problem`, so the model
  picks another name.

### A3. Delete a project, with a three-way choice
- **Now:** Delete in the sidebar menu is disabled. Hide exists (window only).
- **Should:** Delete asks which the person means: (1) remove the project but keep its data,
  (2) remove the project and its data, (3) just hide it. Option 2 says exactly what will be
  deleted (collections, records, files, automations; sub-projects included) and that it cannot
  be undone. The journal is never deleted.
- **Core needs:** a route for "remove, keep data" (the project leaves the sidebar, its data is
  kept and restorable) and one for "remove with data" (removal deletes everything related,
  except the journal).

### A4. Removed projects, with Restore
- **Now:** Settings › Removed projects is an empty card.
- **Should:** lists projects removed with their data kept: name, when removed, size. **Restore**
  puts the project back in the sidebar where it was.
- **Core needs:** a list of removed-but-kept projects and a restore route.

### A5. Several workspaces, Manage Workspace, Sign out
- **Now:** the workspace menu shows one workspace ("Kenil's workspace"); Manage Workspace and
  Sign out are disabled.
- **Should:** the menu lists the person's workspaces and switches between them; Manage Workspace
  opens its settings; Sign out signs out of this Mac's Alpha.
- **Core needs:** the notion of more than one workspace, switching, and signing out.

---

## B. Collections, fields and records

### B1. Add a column (field)
- **Now:** the "+" column header and ⋮ › Add column are disabled ("ask Alpha in the panel").
- **Should:** "+" opens a small form: name, type (text, number, date, status, choice, person,
  file, link to another record…), and for a choice or status its options. Create adds the column
  at the end; existing records read "Unknown" in it.
- **Core needs:** a route to add a field to a collection's schema.

### B2. Rename a field
- **Now:** "Rename field" in a column's menu is disabled.
- **Should:** renames in place; the new name shows in the table, record pages, filters and
  saved lists that use it.
- **Core needs:** a route to rename a field, updating saved lists that refer to it.

### B3. Reset to the computed value, and forced edits
*(Forced edits were set aside in Q35 because the core refuses such values; listed here so the decision can be revisited.)*
- **Now:** "Reset to computed value" is disabled; the core refuses a value that isn't one of a
  field's choices or doesn't match its type.
- **Should:** a person may type a value that departs from the norm (overrides a computed value,
  isn't one of the choices, is out of the usual range, or doesn't match the type). It is saved,
  marked with a quiet "Overridden" chip with the reason on hover, and **Reset to computed value**
  in the field's menu restores the computed one.
- **Core needs:** accepting such values with a flag that says they are overridden (and why), and
  a reset route.

### B4. Per-record notes and per-record history
- **Now:** a record's Notes are read through the project's notes list; its History reads the
  project's last 500 activity entries and filters them.
- **Should:** Notes shows the notes about this record only, with Write. History shows every
  change to this record, newest first: who (you, Alpha, an automation or agent), old and new
  value, absolute date and time; Undo/Redo step through it.
- **Core needs:** a route for a record's notes and one for a record's change history.

### B5. Provenance per value
- **Now:** "Estimated" / "Assumed" chips are per record.
- **Should:** each value says where it came from (typed by you, read from a source, estimated or
  assumed by Alpha) and when; the chip sits on that value only.
- **Core needs:** provenance stored and returned per field value.

### B6. A file in a file field of a record that doesn't exist yet
- **Now:** on a new record, the file field can't take a file until the record has been created.
- **Should:** choosing a file on a new record creates the record, then attaches the file.
- **Core needs:** creating a record and attaching a file in one step (or attaching to a record
  just created).

### B7. Save an edited file (CSV)
- **Now:** a CSV opens as an editable grid only if it was uploaded in this visit; Save is
  disabled; Download of the edited copy works.
- **Should:** any CSV in a project's Files opens as a grid; Save writes the edited file back,
  kept as a new version with history.
- **Core needs:** a route that returns a file's content and one that writes a new version.

### B8. Files listed for a project
- **Now:** a project's Files lists only what was uploaded during this visit.
- **Should:** lists every file the project holds (name, type, size, when added, which records use
  it), with Open and Show in Finder.
- **Core needs:** a list of a project's files.

### B9. Save a dashboard's selection as a list
- **Now:** a Dashboard tile's "Show these 12" opens the table filtered to those records; that
  filter can't be saved.
- **Should:** "Save as list" turns that selection into a saved list with a name.
- **Core needs:** saved lists that can hold an explicit set of record ids (or the tile's rule).

### B10. Create a person or an organisation in Network
- **Now:** Network's People and Organizations tables show "+ New" disabled.
- **Should:** "+ New" opens a new person (or organisation) page; the first field filled creates
  it; it then appears in the table, the brain view and wherever people are linked.
- **Core needs:** a route to create a person or organisation entity.

### B11. Files in Network
- **Now:** Network has no Files section.
- **Should:** like a project: files can be dropped on Network or a person and are listed there.
- **Core needs:** files tied to Network or to an entity.

---

## C. The assistant

### C1. Depth: Quick overview and Deep thinking
- **Now:** the composer shows "Quick overview"; "Deep thinking" is disabled ("Choosing depth
  needs Alpha's core").
- **Should:** Quick overview (the default) answers fast and ends by offering to go deeper where
  that would help. Deep thinking takes longer, uses the strongest model, and shows its steps.
  The person can star either as their default.
- **Core needs:** `ask` accepts a depth (`quick` | `deep`) and maps it to the model tier of the
  chosen route (Claude or ChatGPT).

### C2. Everything the assistant makes is saved as a file
- **Now:** reports, summaries, tables and drafts live only in the conversation.
- **Should:** each is saved as a file with a clear name in the project's Files, kept with its
  history (versions), and linked from the conversation turn that made it.
- **Core needs:** saving outputs as documents in the project, and a turn that carries links to
  them.

### C3. Each reply shows its sources
- **Now:** under a reply, a grey line shows the time and the steps only.
- **Should:** the line also lists which route answered (Claude or ChatGPT) and which records and
  files the reply used, each a link that opens it.
- **Core needs:** a turn that returns the route and the records and files it used.

### C4. Confirm the goal before building
- **Now:** question cards (choice pills plus "Or say it your way") exist, but nothing decides when
  the assistant uses them.
- **Should:** before building a project, workflow or automation, the assistant restates the
  objective in one sentence; if anything is ambiguous it asks one or more short questions as
  question cards; if the request is already explicit, it skips this and builds.
- **Core needs:** this rule in the planning step (a mechanism, not only a prompt line).

### C5. Approve a plan once
- **Now:** a plan is approved, and some of its actions may ask again.
- **Should:** approving a plan approves its routine steps; only steps that leave the workspace,
  delete something or can't be undone ask again.
- **Core needs:** the plan's approval carried to its steps, with those three exceptions.

### C6. Proposals say the expected outcome and how success is judged
- **Now:** plan and action cards show the task only.
- **Should:** each card shows the task, the expected outcome, and how success will be judged.
- **Core needs:** plans and actions that carry these two fields.

### C7. Ask before sharing data with an outside service
- **Now:** no notice.
- **Should:** when a request would send data to an outside service, an amber notice shows exactly
  what will be shared and with whom, and waits for the person's yes.
- **Core needs:** detecting such requests and returning what would be shared before doing it.

### C8. Address other agents with @
- **Now:** typing @ says Alpha is the only agent.
- **Should:** @ lists the workspace's agents; the message goes to the one chosen.
- **Core needs:** routing a message to a named agent.

### C9. Delete a conversation
- **Now:** Delete is disabled; Archive works.
- **Should:** Delete asks, then removes the conversation from the list; what Alpha learned from
  it stays; the journal keeps the record.
- **Core needs:** a route to delete a conversation (not the journal).

### C10. Stop live work from Home
- **Now:** Home's "Alpha is working on" lists live work with Open but no working Stop.
- **Should:** Stop beside each item stops that piece of work and says so.
- **Core needs:** live work returned with an id that can be stopped.

---

## D. Intelligence, Home and Settings

### D1. Forget an accepted fact; edit a fact or a goal
- **Now:** facts waiting for confirmation can be accepted or rejected; accepted facts and goals
  can't be edited or forgotten.
- **Should:** every fact has Correct (edit in place) and Forget (asks first); goals can be edited
  and marked done or dropped.
- **Core needs:** routes to edit and forget a fact, and to edit a goal.

### D1b. Memory as plain, editable text, with export
- **Now:** what Alpha remembers is shown as separate facts, goals and notes in Second Brain;
  there is no single readable view of it and no way to take it away.
- **Should:** Second Brain › Memory shows everything Alpha remembers about the person as one plain
  document in ordinary sentences, grouped by topic (about you, your projects, your people, your
  instructions and permissions). The person can edit any sentence in place; an edit corrects or
  forgets the underlying fact, goal or note, and History records it. **Export** downloads the
  whole memory as a Markdown (and JSON) file with each item's source and date. Why: owning your
  memory builds trust, and trust is what keeps people using Alpha.
- **Core needs:** a route that returns all memory as ordered, editable text items (each mapped to
  its fact, goal or note, with provenance), a route that applies an edited sentence back to its
  item, and an export route.

### D2. Edit skills, agents and automations
- **Now:** their pages show fields as editable, but Save is disabled.
- **Should:** changes to name, description, trigger, schedule and instructions save (with the
  same Save / "Last saved" behaviour as records).
- **Core needs:** routes to update a skill, an agent and an automation.

### D3. Connections: Blocked state and which projects use each
- **Now:** a connection shows Working, Needs your sign-in or Being repaired.
- **Should:** also **Blocked** (with the reason), and the list of projects that use it.
- **Core needs:** the blocked state and the projects per connection.

### D4. Governance rules are followed
- **Now:** each project's Governance has Always and Never rules the person can add and edit; they
  are saved but the assistant doesn't read them.
- **Should:** the assistant obeys them in that project, and a refusal names the rule.
- **Core needs:** the runtime reading `governance_rules` for the project and enforcing them as a
  gate in code.

### D5. Try again for any failure
- **Now:** Home's "Didn't work today" cards offer Try again only for an agent's run.
- **Should:** every failure card (a reader, an automation, a sync, an action) offers Try again,
  which reruns exactly that and reports the outcome on the card.
- **Core needs:** a rerun route per kind of failure (or one generic rerun by activity id).

### D6. Home's suggestions
- **Now:** no Suggestions part on Home.
- **Should:** what Alpha noticed, each as a proposal with Approve and Decline.
- **Core needs:** suggestions produced and returned.

### D7. Dashboard tiles for goals and suggestions
- **Now:** Dashboard tiles cover metrics, breakdowns, over-time and needs-attention.
- **Should:** also "Progress toward a goal" (the project's goals with the next step) and
  "Alpha's suggestions for this collection" (proposals with Approve and Decline).
- **Core needs:** goals per project with progress, and suggestions per collection.

### D8. Settings › Notifications and Builder rules
- **Now:** both are empty cards.
- **Should:** Notifications: what may interrupt and when. Builder rules: how Alpha makes projects
  (default views, metrics, naming), each an editable sentence.
- **Core needs:** storing both and the assistant honouring them.

### D9. Home's failures for a whole day
- **Now:** "Didn't work today" reads the last 300 activity entries, so a very busy day may miss
  older failures.
- **Should:** every failure of today, however busy.
- **Core needs:** activity filterable by day and by failed.

### D10. Formula fields (fx)
- **Now:** no formula fields; a column can't be computed from other columns.
- **Should:** a column type **Formula** (shown with an **fx** icon) whose value is computed from
  the record's other fields (arithmetic, text joins, date differences, if/then, sums over
  related records). The formula is edited in a small editor with field-name suggestions and a
  live preview of the result on the first rows; an error says what is wrong in plain words.
  Formula cells are read-only and say "Computed by a formula" on hover; they sort, filter and
  summarise like any other value.
- **Core needs:** a formula field type in the schema, evaluation (on write or on read) with
  recomputation when the inputs change, and validation that returns plain errors.

---

## E. The Mac app's native code (`desktop/src-tauri`, Rust)

These need the host, which this branch doesn't change.

### E1. Remember where the companion was dragged
- **Now:** the companion (the always-on-top character) can be dragged anywhere, but on the next
  launch it returns to the default, the bottom-right corner of the screen (Kenil's behaviour,
  kept as the default).
- **Should:** wherever the person drops it, it reopens there next time (per display); if that
  display is gone, it falls back to bottom-right. A "Reset position" in the companion's menu
  puts it back in the corner.
- **Host needs:** saving the companion window's position when a drag ends and restoring it when
  the window opens.

### E2. The companion window's title
- **Now:** the companion's window is titled "Alpha companion", set in `desktop/src-tauri/src/lib.rs`
  (the window side, `avatar/AvatarWindow.tsx`, can't change it).
- **Should:** the title matches the product words: the assistant's name (by default "Alpha"), so
  Mission Control, the Dock and screen readers show the same name the panel shows.
- **Host needs:** the window title set from the assistant's name (or simply "Alpha").

### E3. Send by voice when a sentence is finished
- **Now:** speaking fills the message box as you talk (`shell/voice.tsx`); you press Send
  (Kenil's version, kept).
- **Should:** an option in Settings › Appearance (off by default): "Send when I stop speaking".
  When on, a short pause after a finished sentence sends the message; the words stay visible for
  a moment with **Stop** so a mis-heard sentence can be caught before it goes. When off, it
  behaves as today.
- **Host needs:** if end-of-speech detection uses the Mac's native speech recognition, the host
  must report the end of an utterance to the window; if it stays in the web view, this is window
  work only.

---

## F. Left in the window (no core needed), for completeness

- The table footer's **Calculate** menu and the column menu's **Wrap text** still use their old
  menus rather than the standard dropdown (search, star, highlighted choice).
- **Download** shows CSV and Excel beneath it inside ⋮ rather than as a side submenu (the ⋮ list
  scrolls, so a side submenu would be cut off).
- In the brain view, individual record dots can't be reached by keyboard; touchscreen pinch-zoom
  isn't supported (trackpad pinch and the +, − and Fit buttons are).
- The sidebar's drag-to-nest fix is for the Mac app's WebKit; it is unit-tested but not yet tried
  in the Mac app.
- The record page's leave-guard props (`onGuard`, `PeekGuard`) are no longer used and can be
  removed from `App.tsx`, `DataPage.tsx` and `ModulePage.tsx`.

---

## Not adopted, by decision (no work needed)

- "Task manager is always the first project" (the platform knows no domain).
- The sidebar's top row as the Mac title bar (the host is not changed on this branch).
