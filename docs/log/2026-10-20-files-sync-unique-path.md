# The files sync's UNIQUE(path) failure, fixed (20 Oct 2026)

Since his whole `~/Desktop/dev` was granted (07:51 UTC), the core log showed "sync of
/Users/kenil/Desktop/dev failed" with `sqlite3.IntegrityError: UNIQUE constraint failed:
documents.path` from `connectors/files.py` `_save` (18 times in the current `core.log`; S3's
note). The cause and the fix went to Kenil in writing first. His word: "yes, fix it as
proposed: in-transaction insert-or-update, conditional removal, and a path kept by another
folder left to that folder". Committed on his word after his look (below).

## The cause

Two syncs of the same folder ran at once, and the second inserted a file the first had just
inserted.

- `_sync_one` read the folder's documents once, before walking it, and chose insert or update
  from that list, which could be out of date by then.
- One walk of `~/Desktop/dev` takes 8 s (the connector's own `_walk`, 3,862 files, measured
  read-only). The watcher starts a sync 2 s after the last change, each on a new timer
  thread, and nothing stops a second one while one runs. With Claude sessions and journeys
  writing into `alpha-brain/docs` all day, two often overlapped.
- A failure stopped that whole sync (files later in its walk unread, removals unmarked) and
  showed the folder broken until a later sync got through. A copy of his world (SQLite's
  backup) had the last sync clean at 13:10 BST, 3,864 documents.
- **Ruled out:** a path twice in one walk (none, nor by letter case, Unicode form or
  symlink); two folders overlapping (his world has one files connection); a row of another
  connection or a kept file (his two kept files are in Alpha's own `files/accounting`); P6's
  hash (a folder's sync never checks it).

## Built (`connectors/files.py`)

- **`_save` decides inside its transaction.** In the same `store.tx()` as the write it reads
  the path's row: none, insert ("Read …"); this folder's row at this file's modified time
  and not removed, nothing (another sync just read it) and no second journal line; this
  folder's row older or removed, update ("Read again …"). It returns what it did, and
  `_sync_one` counts from that.
- **The removal is a conditional write** (`AND removed_at IS NULL`), journaled and counted
  only when it changed a row, so two overlapping syncs don't both say "… was removed".
- **A file another watched folder already reads stays that folder's document** (his choice).
  A folder granted inside one already granted no longer fails the outer sync. The folder's
  documents are listed by a range on the path (`path > '<root>/' AND path < '<root>0'`), so
  such a file is skipped before it is read, and only the folder's own rows can be marked
  removed. The query plan searches the path's index; the old `WHERE connection = ?` had none.
- **Not built:** a lock letting one sync of a folder run at a time. An overlap now costs some
  repeated reading, never a failure or a doubled line.

## What ran

- **Tests** (`test_connectors.py`, new):
  - `test_two_syncs_of_one_folder_at_once`: a second sync runs inside the first's walk; the
    first finishes, the folder stays connected, one "Read" line and one "removed" line;
  - `test_a_file_another_folder_reads_stays_with_it`: an inner folder's files, including one
    it reads while the outer folder walks, stay its own; the outer sync marks none of them
    removed;
  - both failed on the old connector with the log's traceback, and pass with the fix;
  - `just stats`: core 450 passed, desktop 240; lint and types clean.
- **In his world:** after the restart and his Read now (below).

## Restart

Restarted on his word ("yes, restart the core so the fix runs on my ~/Desktop/dev"): at
14:23 BST the core was stopped and the app started it again on the same port (50264), on the
repository's code; the window needed nothing. Before it, the old core had failed 31 times in
`core.log` (18 in the morning), its last at 14:07 BST, leaving the folder "Not working".

**No sync has run since, in either core.** A change I made under the folder at 14:28 started
none, and the copy at 14:31 still had the folder broken from 14:07.
- The core's watcher thread is alive, and new timer threads keep appearing (`sample` of the
  core).
- A 10 s listen on the folder's events (read-only) heard 22, all in
  `alpha-brain/desktop/.check`, with no quiet gap over 0.9 s. That is the desktop check another
  session started at 14:06 (`alpha check-desktop`, still running at 14:32).
- The watcher waits for 2 s with no change before it syncs, and each change starts the wait
  again, so a writer that never pauses for 2 s stops every sync. The walk skips `.check`, but
  the watcher does not.
- So the fix had not yet run in his world. "Read now" on the folder (Intelligence ›
  Connections) syncs without the watcher.

## Kenil's look, and the commit

- **His Read now at 14:37 BST:** the folder went from "Not working" to Connected with no
  problem. The 20 files changed since 14:07 were read once each (14 new, most of them
  journey reports, and 6 read again, among them `STATE.md`).
- **The watcher synced again** at 14:37, 14:39 (twice) and 14:40, once the desktop check's
  writes stopped.
- **A copy of his world at 14:41:** no path read twice since the restart, and no new line in
  `core.log`.

His word: "Read now shows Desktop/dev Connected with no problem and each file read once in
Activity; commit the fix". Committed on it, with only this work's lines of `STATE.md` and
`log/README.md` (another session's section C edits there are left to it).

## Seen on the way, not changed

- The watcher reacts to every change under the folder, including `.git`, `node_modules`,
  `.venv`, `.check` and build output that the walk then skips. Every commit or build starts an
  8 s walk, and a writer in one of them that never pauses for 2 s stops every sync (above).
  The walk also goes through those folders before dropping them (`rglob("*")`, then the
  filter).
- A file deleted between the walk and its read (an editor's save by rename, a temporary file)
  makes `path.stat()` raise and fails the whole sync the same way. Not in his log yet.
