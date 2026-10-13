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

## Step 2: fields added and renamed by hand, a file on a row not yet saved (B1, B2, B6, this commit)

- **B1 Add a field** (`Collections.add_field`, `POST /api/tables/{name}/fields`; the window's
  `AddFieldButton`, the + at the end of a table's header row): a name in the person's words (the
  id made from it) and a kind (text, long text, number with an optional unit, date, date and time,
  yes or no, one choice, several choices, status with which options mean done, web address,
  file); at the end, empty on every row; a name the table has is refused beside the form. The
  person's own edit, journaled ("You added the field Asking price to Sites."), and, as Kenil
  decided, the module's workflow page gets a new version with it (`Workflows.follow_field`, the
  one before kept). A link to another table is by asking Alpha (it needs the table and how they
  relate); a program module's own table offers no +.
- **B2 Rename a field** (`relabel_field`, `POST /api/tables/{name}/fields/{field}/rename`; the
  column menu's Rename…): its label, so its id, which the rows, lists and colours keep, stays;
  journaled, the workflow page following. Every place that names a field now goes through one
  `fieldLabel` (the header, record pages, filters, the add-a-row form, the Set and paste
  messages, the column menu), several of which showed the id.
- **B6 A file on a row not yet saved**: the add-a-row form takes a file in a file field; the row is
  saved, then the file attached to it (the core's attach existed; no core change).
- **A2, the gap step 1 opened**: a workflow's thing named like the workflow (its module's name to
  be) would have made the table the new rule refuses, failing the build; the page refuses it
  while written (`_things_named_apart`), so Alpha renames it in the interview.

Seen in Kenil's own world before this commit (the journal): he renamed "Car Wash Site Scorecard —
Austin" to "Car Wash Site Scorecard", removed Notes with its data kept, then deleted it for good
from Settings ("Removed Notes: 1 table (3 rows).").

What ran: `just lint` clean; 236 core tests (3 new: a field added by hand, journaled and on the
page as a new version, refused without choices or with a name taken; a field renamed keeping its
id, the page following; a workflow's thing never named like the workflow); 179 desktop tests in
40 files (4 new: the add form with a status's options and done ones; a refusal beside it; Rename
from the column menu; a file on a new row, the row first); `just check-desktop`: 79 of 79 pages
clean at every size (`docs/checks/2026-10-13-1641.md`; two fewer pages because Notes is gone from
his world). In the browser pane on the check copy: "Body fat" added as a number in % to Body
Weight Log, empty on its row, renamed from its menu to "Body fat share" (fields can't be deleted
yet, so it stays in that copy). "ok commit it, then tell me what step 3 is".

## Step 3: files listed, dated, deleted, and kept about people (B8, B11, G4, G6, this commit)

Proposed in writing with one decision: what happens to the rows Alpha read from a deleted file.
A row names its source in words, not by the file, so they can't be found reliably; Kenil: "ok keep
the rows, go ahead with step 3". Built:

- **B8 A module's files** (`GET /api/modules/{ref}/files`, `Files.used_by`; the window's
  `FilesView`, a "Files N" tab beside the tables once it holds one): the one data view: Name,
  Kind, Size, Added, Used by (which records' file fields hold it), From (added here or the
  person's folder); Open and Show in Finder (the Mac app), Delete….
- **G6 A file's date**: every file the core sends has `added_at` (when Alpha took or first read
  it); shown in the Files tab, a record's file cell, a person's page.
- **G4 Delete a file** (`document_removal`, `remove_document`, `GET …/removal`,
  `DELETE /api/documents/{did}`): asks with what goes; Alpha's copy, the text read from it (out of
  search), each file field that held it emptied as the person's edit (in the record's history);
  the rows Alpha read from it stay, said in the confirm; journaled ("Removed march.txt: …"). A
  connected folder's own file is the person's: refused in the core, greyed with why in the window.
- **B11 Files about a person or company** (`documents.about`, `GET /api/entities/{eid}/files`,
  `POST /api/files` with `about`): a Files section on their page, with Add files and drop; read
  and searchable, no turn; in their "Everything with…"; a merge moves them to the one kept.
- Fixed on the way: adding files showed the core's raw status on a failure (section 9a had missed
  this path); it uses the plain words now.

Open, small: the "Removed intro.txt…" line is journaled but not linked to the person, so it
isn't in their "Everything with…".

What ran: `just lint` clean; 240 core tests (4 new: a module's files with dates and the records
using them; a delete emptying its fields, keeping the rows, out of search, the file gone; a
connected folder's file refused; files about a person following a merge); 181 desktop tests in
41 files (2 new: who uses a file in words; the list, the folder file's Delete greyed, the confirm
with what goes and that rows stay); `just check-desktop`: 79 of 79 pages clean at every size
(`docs/checks/2026-10-13-1717.md`). In the browser pane on the check copy: Advisory's Files tab
(its 7 statements, dated 2 and 3 Oct), Cevina Feng's page with a file added about her, listed and
in her journal, then deleted through the confirm. Not seen in the Mac app (Open and Show in
Finder are the app's). "ok commit it, then tell me what step 5 is".

## Step 5: conversations renamed and deleted (G1, C9, this commit)

Proposed in writing; Kenil: "ok go ahead with step 5". Built:

- **G1 Rename** (`conversations.rename`, `POST /api/conversations/{cid}/rename`, `threads.titled`;
  the window's `RenameBox` and `useConversationActions`): from the panel's picker ("This
  conversation": Rename…, Delete…) and a right-click on the Assistant page's list; empty refused;
  the person's title kept from then on; one started with + New takes its first message's words
  (`name_from_first`, on `POST /api/ask`) unless named; journaled; a rename isn't activity, so
  the conversation keeps its place.
- **C9 Delete** (`conversation_removal`, `remove_conversation`, `GET …/removal`, `DELETE
  /api/conversations/{cid}`): asks with what it does; its open questions closed as removed, its
  undecided actions declined, a workflow page drafted in it kept with its module (unlinked); the
  thread goes; the journal keeps its turns, marked as from a removed conversation (the removal
  journals itself like a module's); refused while Alpha works in it. The Assistant page opens the
  next conversation when the open one went; the panel starts fresh.

Fixed while building: renaming to the same title didn't mark it the person's; a rename moved the
conversation to the top of the history (it touched the time it was last active).

What ran: `just lint` clean; 243 core tests (3 new: the person's title kept and an unnamed one
named by its first message; a delete closing its question, unlinking its page, history marked;
refused while working); 183 desktop tests in 42 files (2 new: rename and delete from the panel's
picker; a right-click delete on the Assistant page opening the next); `just check-desktop`: 79 of
79 pages clean at every size (`docs/checks/2026-10-13-1742.md`). In the browser pane on the check
copy: one of several "New conversation"s renamed "Car wash next steps" from a right-click, another
deleted through the confirm and gone from the list. "ok commit it, then tell me what step 4 is".

## Left

Step 4 (people: a person or company made by hand, the person's own organisations) proposed next;
then 6–9. Nothing pushed.
