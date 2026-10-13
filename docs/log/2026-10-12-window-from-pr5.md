# The window from pull request #5, feature by feature (12–13 October 2026)

Kenil, after the review ([`2026-10-12-review-pr5.md`](2026-10-12-review-pr5.md)) and the
inventory of what the branch does against main: "merge first looks okay, and your
recommendations look okay too. but i dont want to blindly copy their code, i want you to review
and decide how best to add those exact features we agreed on into the current code in a clean
and modular way." Then, on how: "lets do one section at a time, making sure it aligns and adhers
to current main design, what i want from the pr is the features and some guidance", and "before
making the change, tell me exactly what you you going to change and how (preferably share
screengrabs as well) so i can approve". Not a `git merge`, and not the branch's design: each
feature is proposed, approved, built in main's own styles and components, seen in the Mac app,
reviewed by Kenil and committed on his yes (Q41 says which features, Q42 how). Nothing pushed;
nothing posted on the pull request.

## What was agreed (Q41)

- **Taken:** the data view (filters, several sorts, groups, footers, conditional colours, bulk
  edit, saved lists as tabs, the numbers strip); a page per record with History, Undo and Notes;
  each value's source, date and problem visible, Try again and the parts' buttons; a program
  module's own tables read-only; the Estimated and Assumed marks on the title too, both counted;
  a paste written one row at a time; plain errors, absolute dates, every delete confirming; the
  sidebar's order, icons, hiding and nesting, and the workspace's name; Home's tiles and "Didn't
  work today"; Settings as cards for what exists; Intelligence's graph, facts as a table, Skills
  and Connections as tables, the agents as Alpha and the automations (Q33) with a look per
  agent; the assistant's picker of conversations, each turn's provenance and Retry.
- **Skipped:** star defaults, the load limit, the choice of record sections, a Depth knob with a
  stored default, Governance rules the runtime does not read, empty Settings pages, the
  new-project page past the interview, a Network item in the sidebar, Activity and the Assistant
  out of it, the CSV editing grid (B7, later), the branch's rewrite of the design document.
- **Guidance:** Vikas's rulebook is kept at `design/research/ui-rulebook.md` with him named;
  where it and the design differ, the design binds.

The order of sections proposed: (1) Home's "Didn't work today"; (2) the record page, in two
halves, 2a the page and 2b History with Undo and Notes; (3) the table's toolbar (saved views,
filter rules, sort, group); (4) the table's extras (totals, colour, bulk edit, paste one write
per row, the numbers strip); (5) the sidebar; (6) Settings as cards; (7) Intelligence; (8) the
assistant panel; (9) plain errors, absolute dates, every delete confirmed.

## Section 1: Home's "Didn't work today" (this commit)

Proposed with the order of the nine sections and screenshots of Home on main and of the
feature on the branch; Kenil: "there should be a close/discard option as well to clean this
up. other lets do it, stop after its done and i will review", then, on the screenshots of the
built section: "yes commit it". Built in main's own markup and styles, nothing new in the
stylesheet: a section after the tiles, the rows of "Coming up" (time, the sentence, the reason
when the journal has one), Try again for a failed automation run, Open where it happened, ✕ to
dismiss one and Clear all. Dismissing clears it from Home only (the preference `home_dismissed`,
today's ids only, so it never grows); Activity keeps every entry. The tile says "below" while
there is something to see. The failures are asked of the journal by kind (`/api/activity`
already took `kind`; the client now passes it), so no core change. Not built: Try again for a
reader's or a part's failure, which needs a core route (the plan's slice 2).

What ran: typecheck clean; 90 desktop tests in 28 files (four new); the Mac app rebuilt, Home
seen in WebKit at 1240×820 with today's two reader failures; `just check-desktop`: 66 of 66
pages clean at every size (`docs/checks/2026-10-12-2211.md`). Dismiss and Clear all were not
clicked in Kenil's world (they write to it); the tests cover them.

## Section 2a: a record's own page (13 Oct, this commit)

Proposed in two halves (2a the page, 2b History with Undo and Notes) with screenshots of main's
drawer, the branch's record page and main's automation page as the pattern; Kenil: "yes do 2a,
stop after and i will review". Built: a row opens its own page (`RecordPage`, at
`#/m/<module>/<table>/<record>`, `#/records/<table>/<record>` for a table in no module) in the
automation page's markup: a back button named for the table (it opens the module on that
table, `#/m/<module>/<table>`), the title in the serif, when it was added and last changed, the
parts run when asked and Try again for one that could not fill (`ThingActions`, `actionsFor`,
moved out of the data page), Remove after a yes, then Details: the drawer's own field table,
every value editable in place with its origin, the title among them, values wrapping instead of
cut. A related record opens its own page; the window places a record in the module its table
belongs to, so the sidebar and the assistant know. The drawer is gone with its stack, its
state and its styles (`RecordPanel` became `RecordFields`, which the form view also shows).

Kenil's review, while it ran: "single click should not open the page, maybe double click".
A double-click on a table cell already edits it, so in the table a › at the start of each row
opens the page (first put at the end, it was scrolled out of view on a wide table) and a click
on a row does nothing; in the card views (board, list, gallery, calendar, timeline) a double-
click opens, Enter from the keyboard everywhere. Then: "when i select a row, a new row for
remove/clear comes up … everything else goes down by one row, so its flaky". Three ways were
offered; Kenil: "go with 1": ticked rows are counted in the table's header row, which shows
"2 selected · Remove · Clear" over its labels (kept in place, hidden, so no column changes
width); the separate bar is gone. Found on the way, all main's own: a stray "…" before every
row's title (the checkbox cell narrower than its padding), the checkbox column taking the
table's spare width, and the header's rule for its sort buttons stripping every button in a
header cell; fixed in the same lines. "yes" on the screenshots of the app.

What ran: typecheck clean; 97 desktop tests in 30 files; in the browser pane, ticking a row
moved the first row by 0px, the header stayed 34px and no column changed width; the Mac app
rebuilt and seen in WebKit on a car wash score, the site it links to, a Network person and the
job listings with rows ticked; `just check-desktop` with the first record of every table added
to its pages: 81 of 81 pages clean at every size (`docs/checks/2026-10-13-0807.md`). One Home
test failed once while the app compiled in parallel and passed in nine runs after; not changed.
Left from it: switching a module's table by hand keeps the old table in the address, so a
reload reopens the one Back named.

## Section 2b: a record's History, with Undo, and its Notes (13 Oct, this commit)

Proposed in writing; Kenil asked first how a large history is kept and shown, and whether it
should come from Activity at all ("i dont think relying on activity for history lookup is
efficient at all, each table should maintain it's own history maybe?"). The store already
keeps it: `record_versions` holds a record's values before every change, by (table, record,
revision), from every way a value is written (the person, Alpha's tools, a part, a reader's
upsert, which keeps a version only when values really change). In Kenil's world: 242 versions
in 0.11 MB after two weeks, at most 11 on one record. The proposal was revised on that ("ok").

Built: `Collections.record_changes` turns one record's versions into its changes (the fields
that differ from the revision before, what they were and became, when, the provenance of the
new values), newest first, a page at a time, nothing dropped (`more` says an older page is
there), and when the record was added and by whom; `GET /api/tables/<t>/records/<id>/history`
serves it (the query plan: a search of `record_versions` by its key, `collection=? AND
record_id=?`). A record's note is a page of its own scope, `record:<table>/<id>`, titled
"Notes" (`RECORD_NOTE`), loaded with the record and journaled with it in its module; a note on
a record that isn't there is refused; removing a module removes its tables' record notes with
the versions. Alpha's `note_write` names the new scope. On the page (`RecordHistory.tsx`), in
the person page's own markup: History under the details, each change with when, who (You,
Alpha, a reader by name, or the part by its title) and field: before → after, a long text as
"changed" with Show for before and after side by side, Show older, "Added … by …" at the
start; Undo writes the old values back as an ordinary edit, only while the fields still hold
what the change wrote. Notes under it, with Edit or Write, Save and Cancel.

What ran: `just lint` clean; 227 core tests (one new: the history newest first, a page at a
time, the note and its journal, the refusal; the purge test now proves a record's note goes
with its table and another module's stays); 100 desktop tests in 30 files (three new); the
Mac app rebuilt and the car wash site's page seen in WebKit: eleven versions shown as four
changes by the module's parts plus "Added by Alpha", Undo greyed where the memo changed again
later, the memo's before and after side by side; Undo, Write and Save were not clicked in
Kenil's world (they write to it), the tests cover them. `just check-desktop`: 81 of 81 pages
clean at every size (`docs/checks/2026-10-13-0835.md`).

## Section 3a: filters in the columns, several sorts (13 Oct, this commit)

Proposed first as toolbar buttons (Filter with rules, Sort with levels; "ok"). Built that way,
the toolbar no longer fitted on one line at 1240 with the sidebar open (measured: about 920px
for some 1,100px of controls; it only just fitted before), and "Show gone" stacked its
checkbox above its words, a rule of Activity's checklist catching the toolbar's labels. Kenil,
asked to choose: "filters- i want them within the columns (similar to aggrid or mui you
know). Also, what is the "show gone" ?" (rows a reader no longer finds on its site, kept and
hidden); then Show gone and Hide done "into col menus", and all-or-any "keep as switch"; "yes".
While it was built: "sort should not be in the menu, because its already possible by clicking
on column name".

Built: each header has a ⋮ (on hover; kept while the column is filtered) that opens that
column's filter, fitting its kind (a choice column's ticklist of its values with counts and
Select all; a condition and a value, two for "between", for text, numbers and dates; ticked or
not), Clear this filter, and what belongs to the column (Hide done on the status, Show gone on
Seen). A filtered column shows a funnel. A header click sorts by it alone; shift-click adds it
as the next level or turns it around; levels are numbered. The quick dropdowns, the
checkboxes in the toolbar and the first version's buttons are gone; while filters are on the
toolbar says "2 filters · matching all ▾ · Clear all". The matching and the sorts are pure
functions (`matchRule`, `matchRules`, `sortRows`, `sortsAfterClick`, `withRule`); a list saved
with the old quick dropdowns opens with them as ticklists. The core: a saved list may hold
`rules` and `sorts`, each naming a field the table has. Activity's checklist rule is `ul.check`
now.

What ran: `just lint` clean; 228 core tests (one new: a list keeps rules and sorts, refuses a
field the table lacks); 111 desktop tests in 30 files; in the browser pane at 1240×820 with the
sidebar open the toolbar is one line (55px) with room to spare and the Remote/Onsite menu shows
its four values with their counts, inside the window; the Mac app seen with the sidebar folded
(one line); `just check-desktop`: 81 of 81 pages clean at every size
(`docs/checks/2026-10-13-0947.md`).

## Section 3b: grouping in the table (13 Oct, this commit)

Proposed in writing ("yes"): "Group by this column" in a column's menu (choice, status, tick,
link, short text, a date by month); a header row per group with its count that folds; one
level; totals per group left for section 4. Built: `groupable`, `groupRows` (a choice keeps its
own order, a tick is Ticked then Not ticked, months in time order, a link by its title, Empty
last), `groupItems` and `pageOfGroups` (headers and rows paged together; a page that starts
inside a group repeats its header, "continued"); the table draws the header rows; the toolbar
says "Grouped by … · Ungroup"; the pager "195 rows in 4 groups"; the Board uses the same
grouping; saved lists keep it (`group_by`, no core change).

Kenil's review: "when i group by a column, the popup does not go away, it should go away" (main's
`Popover` takes `open`/`onOpenChange` now, and the choice closes it), and "when i open detail
page, and then go back, i lose the groouping": a table's working state (its list, search,
filters, sorts, grouping, page, folded groups) is kept for the session (`sessionStorage`, per
table), so a record's page and Back return to it; a new session opens on the default list
again. Found on the way: a ticklist counted the hidden gone rows (Remote 47 against its group's
29); it counts what the table can show now.

What ran: `just lint` clean; 115 desktop tests in 30 files (five new: the order and labels, the
lines and the continued header, the column's Group by closing its menu, folding, Ungroup,
coming back keeping grouping and a filter); in the browser pane at 1240×820 with the sidebar
open, the job listings grouped by Remote/Onsite (4 groups), Remote folded, page 2 opening on
"Remote · 29 continued", the toolbar one line, nothing past the window; `just check-desktop`:
81 of 81 pages clean at every size (`docs/checks/2026-10-13-1004.md`).

## Section 3c: saved lists as tabs (13 Oct, this commit)

Proposed in writing with two layouts; Kenil: "A". Built (`ListTabs.tsx`): the lists as tabs in
the toolbar after the view switch, in its pill: All, each list (★ on the one the table opens
on), + to save the current view under a name; the current tab's ⋮ holds Rename…, Save changes
to this list, Open the table on this list, Remove this list… (after a yes); a dot while the
view differs from what was saved; lists that don't fit go under More, measured against the
toolbar, the current one always a tab. A list keeps the whole view (search, column filters
with all or any, sorts, grouping, Hide done, Show gone, hidden columns, the view); a sort alone
can be saved. The core: a list may hold `show_gone`. The ⋯ menu has no Lists section now.

To keep the toolbar one line (measured in the browser pane at 1240 with the sidebar open and a
grouping, two filters and six lists on: 964px wanted against 918), the grouping's and the
filters' words became one button, "Grouped · 2 filters ▾" (`ViewState`), whose menu holds what
the rows are grouped by, Ungroup, all or any, Clear all filters. Kenil's review: "the search
bar in toolbar should have fixed width. if i currently click on a view, the hwole row shifts to
left since search text size decreases, which is very flaky": the table toolbar's search is
200px, and the Board's own "By …" dropdown moved into the same button's menu, so switching
between Table, Board, List, Gallery and Form keeps the toolbar 55px tall and the view switch
where it is (measured). At 1100 with the sidebar open and many things on at once, the toolbar
can still take two lines.

Found on the way: the two Home tests that failed now and then made their failures "now", so
their newest-first order hung on the millisecond; they are a second and two seconds old now
(nine full runs clean). A longer wait added first, on the wrong reading that the Mac was
busy, was taken out again.

What ran: `just lint` clean; 228 core tests; 118 desktop tests in 30 files (three new: the tabs
and ★, + saving a sort alone, the dot, Save changes, Rename, Remove after a yes);
`just check-desktop`: 81 of 81 pages clean at every size (`docs/checks/2026-10-13-1056.md`).

## Section 4a: totals chosen per column (13 Oct, this commit)

Section 4 proposed in five steps (4a totals, 4b editing several rows, 4c pasting, 4d colour, 4e
the numbers strip); Kenil: "ok, lets do it quickly". Built: each footer cell is a chooser
(`FooterCell`): numbers Sum (the default, so "Sum 19.5" reads as main's "Total 19.5" did),
Average, Lowest, Highest, Count, Empty, Filled; text, choices and links Count, Empty, Filled,
Unique; dates Earliest and Latest too; None. A column with none shows a faint "+" on hover. A
grouped table's header rows carry each group's totals under the columns. The choices are kept
for the session and in saved lists (the core: a list may hold `footers`, each a field the table
has). `footerValue`, `footersOf` replace `totalsFor`.

What ran: `just lint` clean; 228 core tests (the list test also keeps totals and refuses a field
the table lacks); 119 desktop tests in 30 files (one new: the default sum, Average, a Count on
text, a group's own average in its header); in the browser pane the car wash scores' footer
"Score: Sum 19.5" and nothing past the window; `just check-desktop`: 81 of 81 pages clean at
every size (`docs/checks/2026-10-13-1112.md`).

## Section 4b: editing several ticked rows at once (13 Oct, this commit)

Proposed in writing ("ok"). Built: the header row of ticked rows says "3 selected · Set… ·
Remove · Clear"; Set… (`SetOnRows`) takes a field and a value that fits it (a choice's
dropdown with Empty, ticked or not, a number, a date, text) and writes one edit per row
(`setOnSelected`), each in that record's History with its Undo; "Setting 2 of 3…" while it
runs; a row already holding the value is passed over; a refusal stops it with "Set on 1 of 2;
then: …"; the ticks stay. Not offered: the title, links, files, long text; nothing on a
module's read-only table. No core change.

Kenil's review, with a screenshot: "its getting hidden away": the pop-up opened off the
window's left edge. Main's older menus place themselves (`.menu__list`: absolute, right 0),
which moved every Radix pop-up meant to open to the right of its button to the left of it; the
column menus looked right only because they open leftwards. `Popover` adds `popover` to its
class and that rule gives the placement back to Radix, with 8px from the window's edges; the
list tabs' + and More and the footer's totals had the same flaw.

What ran: `just lint` clean; 122 desktop tests in 30 files (three new: a choice set on two
rows with their revisions, a refusal stopping with the count, nothing on a read-only table);
in the browser pane at 1240 Set… opens under its button, left edges together, inside the
window, and a column's menu still opens right-aligned under its ⋮; `just check-desktop`: 81 of
81 pages clean at every size (`docs/checks/2026-10-13-1143.md`).

## Section 4c: pasting from a spreadsheet (13 Oct, this commit)

Proposed in writing ("ok"). Built (`paste.ts`): `parseClipboard` reads a block as Excel,
Numbers and Sheets copy it (tabs, lines, quoted cells with tabs, breaks and doubled quotes);
`readValue` reads each value for its column (numbers with commas, currency and percent signs;
dates as 2026-10-13, 13 Oct 2026, Oct 13, 2026, 13/10/2026; a date that could be read two ways,
like 03/04/2026, is left out and named, never guessed; ticks; a choice by its name);
`planPaste` fills from the clicked cell across the shown columns and down the rows in the order
they show (a grouped table's folded groups passed over), adds rows for the lines past the end,
counts what it replaces, and names what it leaves out (a value that doesn't fit, a column past
the last, the title, links, files and long text). A single value is an edit of the cell; a
block asks first in main's confirm ("Paste 3 rows × 2 columns? Into Price, Status, on 1 row. 2
values replace what's there. 1 new row is added…", then what is left out) and is written one
write per row ("Pasting row 2 of 5…"; a refusal stops it with "Pasted 1 of 2; then: …"). Not on
a module's read-only table. WebKit pastes only into something editable, so ⌘V on a selected
cell gives a hidden box the paste for a moment and the cell its focus back (also when nothing
came). No core change. Asked whether a paste should write titles too (new rows come without
one); "ok", so the title stays out as proposed.

What ran: `just lint` clean; 130 desktop tests in 31 files (nine new: the block's cells, the
values read and refused, the plan, a single value, a block's confirm and its writes, the ⌘V
path through the hidden box, a refusal, a read-only table); `just check-desktop`: 81 of 81 pages
clean at every size (`docs/checks/2026-10-13-1154.md`). Not seen in the Mac app: a real ⌘V
there would have overwritten Kenil's clipboard; left for him to try.

## Section 4d: colour (13 Oct, this commit)

Proposed in writing ("yes lets do it"). Built: "Colours…" in a column's menu, in main's five
tones only (Green, Amber, Red, Blue, Grey): a tone per value of a choice or status column (its
pill takes it), "Tint rows by this column" (one column tints at a time), and one condition with
a tone for a number, date or text column (the filter's conditions; "is empty" colours the
dash); Clear colours. Kept for the table, not a list, in the core's preferences
(`colours_<table>`), so no core change. The value stays written in the cell; colour never
carries meaning alone. Kenil, not finding it: "wait how do i add colors? cant see in app" (the
⋮ shows on hover, and Job Listings has only two choice columns, its other columns being text);
of the two ways offered, "yes do the second thing": text columns colour by a condition too.
Contrast from main's colours: tone text on the page 5.0–5.6 light and 4.6–8.4 dark, text on a
tinted row 11.0–13.2; main's own green pill (green on its wash) is 4.2, under AA's 4.5, and so
is a green value on a green-tinted row: not changed, Kenil's to decide (it means darkening
main's green).

What ran: `just lint` clean; 135 desktop tests in 31 files (five new: tones on pills, the tint,
a number's condition and Clear, a text column's condition and "is empty", opening with the
kept colours); `just check-desktop`: 81 of 81 pages clean at every size
(`docs/checks/2026-10-13-1214.md`). "ok cool, lets move on".

## Section 4e: the numbers strip, skipped (13 Oct)

Proposed in writing (one fixed line above the data: rows and this week's, the core's totals, the
split as pills that filter). Kenil: "ok lets skip this altogether for now, lets move on". Not
built; the module's Summary tab keeps these numbers.

## Section 5: the sidebar (13 Oct, this commit)

Proposed in writing; Kenil: "ok makes sense, couple of things - 1. module icons should be auto
picked based on name by default. 2. i dont want three dot, just right click is enough". Built:

- **An icon per module**, the same in the sidebar, on Home's card, at the top of its page and in
  ⌘K: picked from the first word of its name that suggests one (plain common words, a look and
  nothing Alpha knows), else main's table icon; the person's pick (34 lucide icons) wins, "From
  its name" goes back. In his world: Job Search, Deal Tracker, Advisory a briefcase, Nutrition a
  plate, Network people, Notes a page, the car wash scorecard a car, Avilo the table.
- **A right-click menu** on a module (the menu key or Shift+F10 too): Open, Change icon, Move to
  (the core's move, journaled as on the module's page), Hide from the sidebar. No ⋮.
- **The person's order**: dragged above or below another, or onto a row's middle to go inside;
  Alt+↑/↓ reorder, Alt+→ inside the one above, Alt+← out. A new module goes at the end of its
  level. WebKit drops only where dragenter was cancelled too (pull request #5's finding, kept).
- **Hiding**: a hidden module leaves the sidebar with what is inside it, nothing else changes;
  "Hidden · N" under New (only when something is hidden) opens beside the sidebar with "Show in
  the sidebar".
- **The workspace's name**: a double-click on "Alpha" renames it; empty goes back to "Alpha".
- Kept in the world's preferences (`sidebar_order`, `sidebar_hidden`, `module_icons`,
  `workspace_name`) through one shared store in the window (`core/preferences.ts`), so a change
  shows everywhere at once. **Removal**: the core's module removal now takes the module out of
  these and deletes its tables' colours (`colours_<table>`, which section 4d had left behind:
  found while proposing this section).

Skipped from the branch: its logo picker, "Manage workspace" and "Sign out" (disabled items for
things that don't exist), a Network item, the heading and status line removed (Q41 keeps main's
layout).

Found in the browser pane: the first drop landed above a module instead of inside it, the drop
reading a place the window hadn't drawn yet; fixed (the drop reads its own position, the drag
id is held outside React's state). Then into, out of and below all worked live on the check
copy, which was put back after.

What ran: `just lint` clean; 228 core tests (removal clears the preferences); 146 desktop tests
in 32 files (8 new: icons from names, the order, drop places, keyboard moves, the menu's hide
and show, icon and move from the menu, the rename, a refused move); `just check-desktop`: 81 of
81 pages clean at every size (`docs/checks/2026-10-13-1239.md`). The Mac app rebuilt and seen:
the icons and the right-click menu in WebKit; no drag tried there (a drop moves his real
modules). "ok commit it, then propose section 6".

## Section 6: Settings as cards (13 Oct, this commit)

Proposed in writing; Kenil: "removed projects - add in the ui for it now, but keep it empty, we
will need it when we implement / proceed otherwise". Built: each part of Settings is a card with
its title and what it is about inside it, in two stacks side by side when the page is wide and
one under the other when it isn't. Cards: **Workspace** (new: the name, the same preference the
sidebar renames, Edit/Save/Cancel; where it lives, with a jump to Your data), Thinks with, Reads
with (now in a card), **Appearance** (gains "Motion and contrast: follow your Mac", which main
already does), Your data, **Removed modules** (new and empty: "Removing a module today deletes it
for good; keeping it here so you can bring it back comes later"; filled when the core's Removed
state, A4, lands), Defaults, **Help** (new: the keys main answers to, each checked in the code
that handles it, and the Mac app's version, "Unknown" in a browser).

Left out of the branch's Settings: its section list and Overview (every card fits on one
screen), Notifications and Builder rules (empty pages, Q41), the depth row (Q41), Experimental
features (main has none), fonts and window colours (knobs); Permissions stay in Intelligence.

Found in the browser pane: CSS columns painted a dark band through Appearance (it was the
page still painting, but two plain stacks are more predictable, so they replaced the columns).

What ran: `just lint` clean; 148 desktop tests in 32 files (2 new: the cards in order with
Removed modules empty and Help's keys, the workspace's rename); `just check-desktop`: 81 of 81
pages clean at every size (`docs/checks/2026-10-13-1251.md`). The Mac app rebuilt and seen on
Settings (both stacks in WebKit). "ok".

## Section 7a: Intelligence's skills as a table (13 Oct, this commit)

Section 7 proposed in writing in four steps (7a skills, 7b connections, 7c agents with a look
each, 7d facts as a table; the Map's World view already is the graph, kept; no saved lists on
these tables for now). Kenil: "yes, do 7a, stop after and i will review". Built:

- **The data view draws rows it is handed** (`HeldRows` in `DataPage`): read-only (no editor
  opens, no ticks, Add, saved lists or Download), the toolbar's end says why; everything else of
  the view works (column menus, search, sorts, groups, colours, views, paging, the working state
  per session). Default colours can come with the rows. A program module's own table is now
  read-only the same way (its cells opened an editor that couldn't save; its Board's drag wrote).
- **Skills** (`shell/intel/skillsTable.ts`): Name, Kind (Reader, Action, Run), Module (only when
  some skill has one), Site, What it does, Health (main's words: Working, Being repaired, Not tried
  yet; green, red, grey until the person colours it), Last run, Rows last read. The › opens the
  skill's page; the cards went (everything they showed is on that page). The built-in hands stay
  as cards under the table.

What ran: `just lint` clean; 150 desktop tests in 33 files (2 new: the rows in words and the
module column only when used; read-only in the view with health coloured and › opening the
page); `just check-desktop`: 81 of 81 pages clean at every size (`docs/checks/2026-10-13-1309.md`).
In the browser pane on the check copy: the Kind menu's ticklist (22 readers, 3 actions, 4 runs),
the pills, paging (19 of 29 on page 1). The Mac app rebuilt and seen on Skills. "ok commit it,
then do 7b".

## Section 7b: Intelligence's connections as a table (13 Oct, this commit)

"ok commit it, then do 7b". Built (`shell/intel/connectionsTable.ts`): the connections that are on
as rows of the data view: What, Kind (Folder, Site, Calendar), Status (main's four pills,
coloured until the person colours them), Last read, Last problem (only when one has one). Main's
own buttons at the row's end, through a new place in the view for a row's buttons: Read now (or
Check for a site) and Remove, which asks first in main's confirm with what goes ("Removes 2
readers, 2 procedures and 1 automation. Your tables keep their rows."). No › (a connection has
no page yet: the view now leaves the › column out when rows have no page). The ways to add one
stay under the table.

Differs from the proposal: it named "Fix or OK" and "Turn off or on", which main doesn't have;
main's own buttons were kept. "What it can reach" is one sentence per kind, and as a column it
made the table wider than the page (the page check flagged the pinned buttons covering cells):
it is said once per kind under the table instead, and the buttons are not pinned.

Open, not changed (main's own toolbar): at 1100 wide with the assistant panel open a table's view
tabs break mid-word ("Tabl e"); put to Kenil (a View dropdown when narrow).

What ran: `just lint` clean; 152 desktop tests in 34 files (2 new: the rows in words and the
problem column only when used; the table with its buttons, no ›, Remove asking with what goes,
Cancel keeping it, Remove removing); `just check-desktop`: 81 of 81 pages clean at every size
(`docs/checks/2026-10-13-1329.md`; the first run, with the column and pinned buttons, had 20
covered cells on this page). In the browser pane on the check copy: Remove's dialog, then
Cancel. Not seen in the Mac app (its window was on another Space or the screen locked). "ok lets
do both 7c, 7d".

## Sections 7c and 7d: agents with a face each, facts as a table (13 Oct, this commit)

"ok lets do both 7c, 7d". Built:

- **7c Agents** (`shell/intel/agentsTable.ts`, `shell/AgentFace.tsx`): Alpha first ("Alpha — your
  assistant", whose › opens the Assistant), then every automation: Agent, What it is for, When it
  runs, State (Running now, On, Off), Next run, Last run, Last verdict (main's verdict words and a
  "Not judged yet", coloured), Why, Module (only when one has one). Each row starts with its face,
  main's companion artwork small and still in a round frame. The switch and Run now are its row's
  buttons. **A look per agent**: an automation's page has "Its look" with the companion's pickers
  (`LookEditor`, split out of Settings' `LookPicker`, which now reads through the shared
  preference store), kept in `agent_looks`; until one is picked it wears Alpha's (the companion's)
  look, and "Wear Alpha's look" goes back. **Removal**: removing an automation (with its module or
  its connection) takes its look out of `agent_looks` (two core tests).
- **7d About you** (`shell/intel/factsTable.ts`): Fact, Value, Where it came from (main's
  `factOrigin` words), Since, How sure (a percent), State (Known, Suggested), the suggested first
  with main's Yes and No; goals, permissions and notes stay cards under it. No Subject or Until
  column: the core sends the person's current facts only, so both would be the same on every row.
- **A row's buttons sit at its start**, after the › (7b's connections too): at the end, the agents'
  and facts' tables are wider than the page and scrolled them out of sight; main's own agents list
  had the switch first.

What ran: `just lint` clean; 228 core tests; 157 desktop tests in 35 files (5 new: agents' rows in
words; Alpha first with a face and no switch, the switch, Run now and › on an automation, Alpha's ›
to the Assistant; facts' rows; the facts table with Yes on a suggested one; an agent's look picked,
kept and put back); `just check-desktop`: 81 of 81 pages clean at every size
(`docs/checks/2026-10-13-1354.md`). In the browser pane on the check copy: the faces, a cat picked
for one agent and its face changing in the table (then put back), facts, connections' buttons at
the start. The Mac app rebuilt; Connections and Knowledge seen in WebKit; Agents not (the app was
in use). "ok commit it, then propose section 8".

## Section 8: the assistant panel (13 Oct, this commit)

Proposed in writing (8a the picker, 8b each turn's line, 8c Retry); Kenil: "ok do all of this".
Built in `assistant/AssistantPanel.tsx`:

- **8a** A conversation picker always under the panel's header: the current conversation's title
  with ▾ (main's pop-up listing the live ones: state dot, title, where started, "needs you"),
  and + New. The chip strip that appeared only with a second conversation, and pushed the
  messages down, is gone (its styles too; the dots stay, the Assistant page uses them).
- **8b** A faint line under each of Alpha's replies from the turn's own record: how long it took
  and how many steps it ran ("12 s · 4 steps"); the "12 s" left the bubble. Nothing guessed: who
  answered and which records it used aren't recorded per turn; the stored cost estimate isn't
  shown (subscription).
- **8c** Retry under a turn that failed without a reply: it sends the sentence that turn answered
  again, as Send does. Never on a reply that worked (pull request #5 offered it on the last reply
  too: "log two eggs" again would log four), nor on a failure its turn went on from.

What ran: `just lint` clean; 162 desktop tests in 36 files (5 new: the line's words; Retry only
where a turn failed without a reply; the picker with one conversation and switching; + New;
Retry sending the sentence again); `just check-desktop`: 81 of 81 pages clean at every size
(`docs/checks/2026-10-13-1424.md`). In the browser pane on the check copy: the picker row and its
pop-up (no live conversation in his world, so "None yet"); nothing sent (the copy answers
through his subscription). The Mac app rebuilt; the panel not seen there (its window was on
another Space). Open: the pager's Previous/Next break mid-word with the panel open, like the view
tabs (main's toolbar at narrow widths), put to Kenil. "ok commit it, then propose section 9".

## Section 9: plain errors, absolute dates, every delete confirming (13 Oct, this commit)

Proposed in writing; Kenil: "ok go for all of these". Built:

- **9a Plain errors**: one helper (`say` in `core/client.ts`) words every error, and the 64
  places that showed a raw message use it. The core's own words pass through (a refusal from the
  world, a sign-in); otherwise `plainError` says what the status means ("That isn't there any
  more; it may have been removed." for a 404, "Alpha's core couldn't take that. Try again." for
  a request it couldn't read, which showed "[object Object]" before, "Something went wrong in
  Alpha's core. Try again." for a failure inside it); the core down is one sentence without the
  engine's words ("Load failed"); a fault in the window itself is "Something went wrong here.
  Try again."; the host's own words (strings) pass through; the detail goes to the console. The
  crash screen's stack is folded under "Details for a bug report".
- **9b Absolute dates**, written by the window, not the engine (the Mac app showed "3 Oct at
  08:15 PM" where Chromium showed "3 Oct, 20:15"): a moment "13 Oct, 14:30" (with the year in
  another year; today's moments too), a day "13 Oct", a heading "Monday 13 October", a month
  "October 2026"; the clock follows the Mac's 12- or 24-hour setting ("2:30 pm"). No
  "Yesterday", no time without its day. Cells, record pages, Home, Activity, the map, calendar,
  timeline, grouping by month. Period names ("Didn't work today", "New today") stay.
- **9c Every delete confirms**: revoking a standing permission asks first with what changes;
  every other delete already did. Dismissing a question and Done on a conversation close, not
  delete, and stay as they are.

Tests that faked a core refusal with a plain `Error` now use `CoreError`, as the client throws.

What ran: `just lint` clean; 168 desktop tests in 37 files (6 new: the core's words and the
plain ones; a window fault never as code; days with and without the year; 24- and 12-hour
times; no Yesterday; the revoke confirm); `just check-desktop`: 81 of 81 pages clean at every size
(`docs/checks/2026-10-13-1443.md`). The Mac app rebuilt; its dates not seen there (the window
was on another Space): whether WebKit reads the Mac's 12-hour clock is the one thing left to see.
"yes".

## The views as one menu when the toolbar is narrow (13 Oct, this commit)

Kenil: "yes do the view dropdown fix, then propose slice 2". Built (`modules/views/ViewPicker.tsx`):
a table's views stay a row of tabs while they fit; when the toolbar is too narrow (1100 wide with
the assistant panel open broke "Table" into "Tabl e") they become one "View: Table ▾" menu. The
fit is measured as the list tabs' is: the tabs at their own width, out of sight, against the
room the rest of the toolbar leaves, the list tabs counted at their smallest (All and +); the
list tabs now also hear a neighbour change width. No tab or pager button breaks a word any more
(`white-space: nowrap`); the pager wraps whole buttons to a second line when it must.

What ran: `just lint` clean; 170 desktop tests in 38 files (2 new: tabs while they fit, one menu
when narrow, a pick from it); `just check-desktop`: 81 of 81 pages clean at every size
(`docs/checks/2026-10-13-1513.md`). In the browser pane: at 1100 with the panel open the menu and
the pager on two lines without a broken word; at 1240 without the panel the tabs as before.

## Left

Slice 2, the small core routes, proposed in writing next. Nothing pushed; nothing posted on the
pull request.
