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

## Left

Section 3 (the table's toolbar: saved views, filter rules, sort, group) proposed in writing
next; the rest one at a time.
