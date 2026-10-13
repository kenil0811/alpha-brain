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
