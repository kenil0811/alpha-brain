# Slice 2: the small core routes (13 Oct 2026)

The routes the window asked for in Vikas's document (`core-changes-for-the-window.md`, decided item
by item with Kenil on 12 Oct), proposed in writing in nine steps: (1) modules A1–A4, (2) fields B1,
B2, B6, (3) files B8, B11, G4, G6, (4) people B10, G3, (5) conversations C9, G1, (6) what Alpha
knows D1, D11, D1b export, (7) finding and redoing D5, D9, D12, (8) export and errors G5, G7,
(9) the Mac host E1–E3. Already done before this slice: B4 (record history and notes, window
section 2b), B5 (a source per value), the window half of G7 (section 9a); D9 half (Home counts the
whole day). Asked of Kenil: E3 as a long press on the mic rather than a Settings switch (no knobs);
B9 deferred (no dashboard on main). Kenil: "ok lets do A1-A4 first."

## Step 1: modules renamed, removed with their data kept, restored, deleted (A1–A4, this commit)

- **A1 Rename** (`Modules.rename`, `POST /api/modules/{ref}/rename`): in place from the sidebar's
  right-click menu (Rename…) and the module page's Settings (Its name); empty or a name another
  module has is refused in words; the module's page (the note `module:<name>`) goes with it;
  journaled ("You renamed Deal Tracker to Deals.").
- **A2 Names never repeat their parent or a sibling**: a table's title can't be its module's
  name or a sibling table's (`Collections._check_title`), a list's can't be its table's title or
  a sibling list's (`Views._check_title`); refusals are `Problem`s, so Alpha picks another name.
  Modules were unique across the world already. Three core tests built "Deals" inside "Deals"
  and now use distinct names.
- **A3 Remove…** (`shell/RemoveModule.tsx`, from the right-click menu and the module page's
  Settings): one question, three answers: hide it from the sidebar; remove it, keep its data;
  delete it and its data, which says first what goes from the core's plan (`removal_plan`,
  `GET /api/modules/{ref}/removal`: "1 table (12 rows) and 1 automation, with Deal Tracker inside
  it") and that Activity keeps that it was here. Back Home when the page you're on went.
- **A4 Removed is a state** (Kenil's reconciliation, 12 Oct): `modules.removed_at` and
  `removed_with` (the module the removal was asked of, the same on everything removed with it);
  a removed module and what it holds leave `modules.all()` (so the sidebar, Home, Alpha's
  context, Intelligence's automations), search, and the scheduler (`automations.due`); nothing of
  it changes. Settings › Removed modules lists each (path, when, what it holds) with Restore
  (back where it was; a module inside a removed one says to restore the one above first; one
  removed on its own stays removed when its parent comes back) and Delete… (asks with what goes;
  the purge, which journals itself). Routes: `POST …/remove`, `POST …/restore`, `DELETE …`,
  `GET /api/modules/removed`.

Found and fixed: a module and its parent removed in the same second were one removal (the
stamp's resolution): each removal now names its root (`removed_with`). Restoring from Settings
didn't tell the window: the sidebar showed the module only after the next poll (Settings now
passes the change on).

What ran: `just lint` clean; 233 core tests (5 new: the rename and its page and refusals; removed
out of sight and back, a module inside can't come first; one removed on its own stays removed;
delete for good says first what goes; names never repeat a parent or a sibling); 175 desktop tests
in 39 files (5 new: rename in place with a refusal in words; the three answers: hide, keep, delete
with what goes; Settings' list with Restore and Delete asking first); `just check-desktop`: 81 of
81 pages clean at every size (`docs/checks/2026-10-13-1621.md`). In the browser pane on the check
copy: Notes removed with its data kept, listed in Settings, restored (the sidebar at once after
the fix), renamed in place to "Quick notes" and back (its page followed both times). The Mac app
rebuilt; its core added the two columns to his world on start; nothing removed or renamed there.
"ok commit it, then do step 2".

## Left

Step 2 (fields: add one, rename one, a file on a record not yet saved) next; then steps 3–9.
Nothing pushed.
