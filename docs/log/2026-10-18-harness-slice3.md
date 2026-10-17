# 18 October 2026 — harness slice 3: Home and the work items

The third slice of `../design/alpha-harness-design.md` §18, its §7 made exact
(`../design/harness-slice-3-proposal.md`; Kenil's yes, 18 Oct: "Yes to slice 3 as written: keep
approvals at their card, every item as a card, and the session fingerprint fix"). Two commits,
as proposed: the core (`8f4a751`), then the window with this entry.

## What was built

- **Two kinds of thread** (`world/modules.py`, `world/store.py`): **Home**, one thread of kind
  `home`, made the first time it is needed, the one conversation and the companion's voice; and
  the **work item**, kind `work`, with its own model session, a state (`open`, `working`,
  `needs_you`, `done`, `stopped`), one plain line (`last_line`: its card) and its own box. A
  world from before has its conversations, builds, topics and agents' threads as work items and
  its "waiting" as "needs you" (the migration on open). `last_line` is set after every turn
  (the reply's first line, or the failure) and after every agent's run (its line, "Last checked
  Sat 07:00, nothing new", or the failure).
- **Routing** (`runtime/conversations.py`, rewritten; `api/turns.py`): a sentence with a thread
  of its own (an item's box, Home's) goes there; `@Name` goes to that agent's own item (opened
  when it has none); otherwise, in the worker, structure first (`@<item title>` names an item; a
  short sentence when exactly one item has asked a question answers it), then **one judgement**
  (`judge.py`, the small model, the question in `config/prompts/route_home.md`) over the roster:
  the open items and the ones done in the last day, each with its state, last line, what it
  touches (its module, tables, skills, sites and people, read from its own journal) and whether
  it asked; plus the person's last corrections. It answers `answer here`, `continue: <title>` or
  `new item`; under the confidence it asks on a card with those as its choices, and the pick
  routes the sentence. A judge that gives no answer at all sends the sentence to Home, which has
  every hand and makes what stands if the sentence turns out to need it (the turn prompt's new
  rule 11); never a card for a question nobody asked. Every decision is a `did` line in Home
  (`routed`, `sentence`, `opened`, `by`, the confidence and why), the card the window shows.
- **Corrections kept and counted:** the window's move of a turn (`POST /api/turns/{key}/move`)
  journals a `changed` line marked `misroute` with the sentence and where it belonged;
  `conversations.corrections` gives the judge the last five, `misroutes` is the count (the
  measure of the judgement, §7). Corrections in words ("answer that here", "only tell me when
  something finishes") are the model's to keep as standing instructions (rule 11).
- **The session fingerprint** (`mcp/inprocess.install`, `runtime/engine.fingerprint`,
  `runtime/turn.ask`): the hands' names and signatures hashed; kept with a thread's session
  (`session_tools`); a session is resumed only when the fingerprint matches, else a fresh one
  starts and a line in the thread says so. The 17 Oct failure (a conversation made on the 72
  names, resumed on the 17 hands, "No such tool available: ask_person") cannot recur.
- **Items settle** (`conversations.settle`): after a turn an item is `needs_you` when a question
  or an action's yes waits in it, `done` when the turn ended well, `stopped` when it failed or
  the person stopped it; Home is `open` again. An agent's run leaves its item `done` when the
  run had something to say, `open` when nothing was new, `stopped` when it failed. One turn at
  a time per thread (`Turns._lock_of`): a sentence typed into a busy item waits for the running
  turn and is read after it, an addition, never a cut. Idle closing is gone (an item ends by its
  turn); `reset_working` still opens what a dead core left mid-turn.
- **An agent's item** (`mcp/tools/agents.py`): an agent made inside a work item makes that item
  its own, so a watch and its runs are one item (the journey's first run had opened two: the
  person's and the agent's). Made from Home, it gets an item of its own. The built-in agents'
  items (Watson's, Columbo's) stay on their pages: never on the roster, Home or the list (§10).
  Their run views keep to the agent's own lines, since the item also holds the turn that made
  the agent.
- **The pre-pack** (`context/prepack.py`): Home's turns (its routing lines as "person: … → sent
  to X") and a WORK ITEMS section for Home; an item's own turns for an item; an agent's item
  keeps its brief and history as before. The API: `/api/conversation` without an id is Home,
  with the routing lines among its turns; `/api/conversations` is Home then the items not over
  and the ones done or stopped today (`done=true`: all); Home's `threads` are the same items;
  deleting Home or an agent's item is refused in words.
- **The window:** a work item's card in Home where its sentence was said (`ItemCard`: the
  sentence, the item's title, state and one line, Open into its own conversation); the panel
  speaks in Home (the core routes; the panel no longer makes a conversation per page) and in an
  item's own box (‹ Home to go back; Done on an item that is open); the picker lists Home and
  the work items with their lines; "Alpha is working on" is lanes by state (Needs you · Working
  · Done today) with each item's line and Open, the steps behind it; the Assistant page lists
  Home and the items by lane (Needs you · Working · Done today · Earlier); `ThreadRow` and the
  thread view are gone (an item is a conversation).

## Proven by tests

`core/tests/test_conversations.py`, rewritten: Home is one thread and the judge sends a
question there; new work opens an item with its card line in Home; a follow-up continues the
item the judge names from the roster (the roster's words checked); structure routes without the
judge (`@title`, the one item that asked); unsure asks with the choices and each pick routes
(continue, new, here); a correction is kept, counted and shown to the judge; the roster carries
each item's line and what it touches and drops the long done; items and Home keep their
sessions only on the same tools (the fresh-session line, the transcripts, the list); an item
waits on a question and a failure stops it (and stays on Home that day); a sentence from a
module page is routed with the module as its scope; a core that starts opens what a dead one
left working; a world from before has its threads as items. 316 core tests; ruff and mypy
strict clean. Desktop: 218 tests, typecheck clean (the timeline test's thread row became the
item card; the picker's words).

## Ran for real

The new journey `two_things_at_once`, fresh world, Sonnet (`../journeys/2026-10-17-2332.md`,
60 s): "watch We Work Remotely for back-end roles" → the judge: new item ("an ongoing watch
that stands on its own"), one item opened, the reader, table, module and agent made in it;
"how many eggs have I logged this week" → answer here ("a quick lookup unrelated to any open
item's subject"), answered in Home, no second item; "make that watch check every day at 7" →
continue the watch's item ("the user calls it 'that watch'"), the schedule changed on the
existing agent, confirmed by the judge check. One item in all. Its two earlier runs found the
two things the tests could not: the agent's own thread as a second item (fixed, Q76), and
Watson's item counted as the person's (fixed). `track_then_log` (21 s) and `question_card`
(5 s) still pass. The page check on Home, the Assistant page and Home's conversation, on a copy
of Kenil's world (`../checks/2026-10-17-2346.md`): clean at both sizes, light and dark; its
screenshots showed two things fixed after the commits: a stopped page of a 16 Oct build sat in
Home (a thread's pages and actions are now that thread's; a thread-less one is Home's), and
items from before had no line (the card falls back to the item's last step). The full page
sweep hung before opening a page and was stopped; to look at. The app was rebuilt and
restarted on it; Kenil's three unrelated sentences in
Home, one card each, a follow-up landing in the right item, and one misroute corrected in words,
are the acceptance still open (the proposal's words).

## Not done in this slice

Agents' runs as resumed sessions (a run starts from its brief and its journal, Q21); the Mac
notification; several items finishing together folded into one Home line; a window button for
the move (the route is kept; the correction is counted when it is used); the labelled set of
Kenil's real Home sentences as the judgement's test.
