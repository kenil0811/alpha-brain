# The desktop's four (3 October 2026, night)

The checkpoint's item 5: supervise the core from the host and reset "working" chats at startup;
pause polling when hidden and replace the global version counter with targeted refreshes; show
every failure; resolve paths before the folder check.

**The host watches the core** (`src-tauri/src/lib.rs`, `watch_core`). Every half second it
looks whether the core is still there. A core that ended on its own is started again on the
same port with the same token, so the windows' sessions stay good, after a pause that starts at
one second and doubles while it keeps dying (to a minute at most; a core that stayed up two
minutes had a fresh failure, and the pause starts over). The windows are told (`core-restarted`,
and `core-down` while it is away). Nothing is started again once the person quits. **The core
opens what a dead one left mid-turn** (`conversations.reset_working`, at a live core's start): a
conversation in state `working` is `open` again, with a journal line saying so; before, it
stayed working for ever, the panel in its fast poll with Done hidden.

**One poll, versions per scope** (`/api/changes`, `api/changes.py`; `desktop/src/core/changes.ts`).
The window asks the core one cheap question (every 3 s while anything works, every 15 s when
quiet, nothing at all while the window is hidden): since the last stamp, how many journal
entries of which kinds, which tables and modules they touched, which entities they named,
whether threads, plans or actions moved, and whether anything is working. The answer moves
versions per scope (home; a table; a module; people; intelligence; activity; the conversation),
and each page refetches only when its own moved. The global counter, the 20 s rail timer, the
panel's 5 s/15 s loop (which bumped every page every 5 s during a turn), the automation list's
and the automation page's 4 s loops, and the companion's 10 s loop are gone; the companion asks
the same question (10 s quiet, 3 s working) and refreshes only when something moved. What the
person does here still refreshes at once (`bump`). The claude-status check runs at start and
when the core comes back, not every minute.

**Every failure shown.** `ui/Trouble`: what failed, where, and Try again. Activity, People &
Companies, a person's page, Settings, the command menu's search and the conversation panel's
load say what went wrong instead of an empty list, "Loading…" for ever or nothing. The panel's
turn poll (`Client.waitTurn`) tries again for up to eight missed answers before the turn counts
as lost (one missed poll used to end it in the window while the core kept working), and stops
at once when the core says it knows no such turn (it restarted); when a send is lost the words
come back to the composer and the message says so. A second ⏎ in the first moment of a send no
longer sends twice. The rail says "Core not answering" and a notice across the page says the
host is bringing the core back (Try now); when it is back everything is looked at afresh and a
notice says so for a few seconds. Row Remove already asked (the drawer's Confirm, table views
stage one).

**Paths resolved first** (`own_file`): `reveal_path` and `open_path` canonicalise both the data
folder and the path (symlinks and `..` followed) before the folder check; a path that isn't
there is refused with words.

**Checked, for real.** The app rebuilt and restarted on it. The core killed by hand
(`pkill -f "alpha.cli serve"`) at 20:37:49: the host's log says `core ended on its own (signal:
15 (SIGTERM)) after 45s; starting it again in 1s` and `core started again on port 57858`, the
same port; killed again at 20:38:13, back by 20:38:16 on the same port; a window screenshot
(WebKit, the real app) showed the green notice "Alpha's core started again. Anything that was
running is open to ask again." across Home, the page reloaded, the rail still "Alpha is
running". Requests to the core, counted with headless Chromium against a trial core on a copy
of the world (`desktop/.check/rate.mjs`, not kept): Home loads with 8 requests (home three times, the conversation twice, health, changes, claude: the two doubles are a page and the shell each asking once); then **4 requests a minute idle, all of them the one poll, and none at all for the minute the window was hidden**. The checkpoint had
measured about 26 a minute idle and 140 a minute during a turn. `just check-desktop`:
`docs/checks/2026-10-03-2043.md`, 61 of 61 pages clean at every size, 0 problems.

**Tests.** Core: the changes feed since a stamp; a core that starts opens the conversations a
dead one left working (and does so from `create_app(live=True)`). Desktop: versions fold from a
change report and bump on the person's action; the one poll asks since the last stamp, often
while Alpha works, says when the core is lost and looks afresh when it is back; a turn's poll
survives missed answers, stops on "no such turn", gives up after enough misses; a page whose
load failed says so with Try again. 199 core tests, 73 desktop in 18 files, lint, mypy,
typecheck and `cargo check` clean.
