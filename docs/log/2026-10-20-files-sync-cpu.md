# Files sync: the walk and the watcher kept the core busy (20 Oct 2026, evening)

Kenil, after the C5 restart: "why are all pages/modules stuck in loading state". The cause and
a three-part fix went to him in writing first. His word: "Yes, build the three files sync
changes as written, then restart the core and give me the test steps in chat." His look:
"ok it looks good". Committed as `1116ff1`.

## The cause

The core (pid 55408, started 16:43 BST for C5) sat at about 200% CPU, and every page waited
behind it. With the window's own token:
- `/api/conversation` gave up after 15 s;
- `/api/modules` took 12.3 s;
- `/api/home` took 8.8 s.

A 3 s `sample` of the core showed Python running, the GIL contended (`__psynch_mutexwait`
1,587), and the rest in `open`, `getdirentries` and `stat`: a folder walk.

- **The walk.** `_walk` used `root.rglob("*")`. It went into every folder under his
  `~/Desktop/dev` (node_modules, .venv, .git, `alpha-v2/.data` with its browsers) and only
  dropped those files afterwards: 245,134 entries visited to keep 3,965 documents, 9.4 s of
  Python a sync (measured read-only, outside the core).
- **The watcher.** It started a sync 2 s after any change anywhere in the folder, including
  in the folders the walk skips. Other sessions' builds and journeys, a DealPilot test's
  browser profile in `alpha-v2/.data`, and the core's own module syncs change something
  there every few seconds.
- **Overlap.** Nothing stopped a second sync of the folder while one ran. Watched on his
  world: syncs finished at 17:09:28, 17:09:51 and 17:09:54 BST, so two were running at once.
- **Not C5.** The connector was unchanged since the UNIQUE(path) fix (`6debc8f`). What
  changed is how much was being written in `~/Desktop/dev`.

## Built (`connectors/files.py`)

1. **The walk passes a skipped folder by.** It is `os.walk`, with a skipped folder (the
   `SKIP_DIRS` names and any hidden folder, `_skipped`) taken out of the listing before it
   is entered. On his folder: 0.44 s instead of 9.4 s, exactly the same 3,965 documents
   (compared read-only before the change).
2. **A change no sync would see starts none** (`_seen_by_sync`):
   - a change in a skipped folder, or to a file the connector never reads (a database, a
     browser's files, `.DS_Store`), sets off nothing;
   - a move counts if either end would be seen;
   - a path the folder can't place is let through, for the sync to judge.
3. **One sync of a folder at a time** (`Syncs`, the watcher's syncs):
   - a burst of changes still syncs a folder once, 2 s after the last;
   - a change while that folder syncs makes exactly one more sync after it, never a second
     one alongside;
   - another folder is its own;
   - a failed sync is logged and lets the next one run.

   "Read now", the files hand and the CLI still call `sync` directly: since `6debc8f` an
   overlap with them costs some repeated reading, never a failure.

## What ran

- **Tests** (`test_connectors.py`, 3 new):
  - `test_a_skipped_folder_is_passed_by_not_entered`: only the root, `app` and `app/docs`
    are listed, never `node_modules`, `.venv`, `.git` or `app/.data`;
  - `test_a_change_no_sync_would_see_starts_none`;
  - `test_a_change_during_a_sync_makes_one_more_after_it`: three changes during a sync
    make one more; the folder never syncs twice at once; a failing sync lets the next run.
  - Core 467 passed; lint and types clean.
- **In his world.** The core alone was restarted on his word at 17:14:31 BST: Alpha.app
  started it again on the same port (64331), and the window was untouched. After 20 s:
  - the core at 0.2% CPU;
  - `/api/conversation` 16 ms, `/api/modules` 2 ms, `/api/home` 10 ms, `/api/agents` 2 ms;
  - in the minute after the restart, other sessions kept writing in `~/Desktop/dev` and no
    sync started;
  - this log file, written at 17:15:37, was read by 17:15:40, one sync about 3 s after the
    write;
  - the core afterwards at 0.1% CPU.
- **His look:** the pages loaded. "ok it looks good".

## Open

The folder reads 1,016 build files as documents, because `target`, `dist` and `build` aren't
skipped names:
- 978 under `alpha-brain/desktop/src-tauri/target`, mostly `.json`;
- 28 under `omni/…/target` and 3 under `Zazoo-main/…/target`;
- 7 under a `dist` folder and 190 under a `build` folder.

Every app build changes about a thousand of them, and the next sync reads them all again.
Whether to skip them is a question for Kenil, not changed here.
