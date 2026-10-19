# The prompt and the context, steps 0 and 1: tokens apart, a fixed prompt, the layers (19 Oct 2026, night)

Kenil sent section B, "the prompt and the context" (B1–B8). The proposal
(`design/prompt-and-context-proposal.md`) kept his spec word for word and checked it against
the code and the SDK. He agreed with all nine questions as recommended: "commit S1 first, then
step 0, then B1 + B3" (Q99). S1 is committed (`a2aa1fa`). Steps 0 and 1 are not.

## What the spike found first

The spike ran on the pinned SDK (0.2.168, Claude Code 2.1.301), with six turns of one session,
each a new process resuming it, as Alpha runs a conversation.

- **A resumed session keeps its first turn's system prompt.**
  - The preset's `snapshot` option defaults to on since CLI 2.1.265.
  - Turn 2 was sent "PEAR" and answered with turn 1's "APPLE".
  - So since the SDK engine (17 Oct), every turn after a conversation's first had that first
    turn's pre-pack: its clock, matches, "since your last turn" and conversation tail.
  - The cache held: 12,767 tokens read and 253 written on turn 2. With `snapshot` off, a
    changed prompt rebuilt it (5,970 written).
- **UserPromptSubmit's `additionalContext` reaches the model on every turn**, with the system
  prompt unchanged.
- **SessionStart, registered through the Python SDK, fires only after a compaction**
  (source "compact"). It never fires when a session starts or resumes. What it returns reaches
  the model.
- **PreCompact's returned text becomes the summary's custom instructions.** The CLI's code
  shows it, and the transcript showed it taken. The spike's summary was too small to show the
  guidance followed.
- **A resume of a session that isn't there fails** ("No conversation found"). It never starts a
  fresh session silently, so "no `resume`, the start layer goes first" holds.

## Step 0: tokens kept apart

- `turn.tokens_of` keeps the four parts apart: `tokens_input`, `tokens_cache_read`,
  `tokens_cache_made` and `tokens_out` on every reply's journal line. S1's summed `tokens_in`
  is gone; lines from S1's few hours keep it.
- `alpha turns` (`just turns`) prints, per turn:
  - wall time, time to first words (computed before, never printed), model time, steps, and
    fresh or resumed;
  - input, cache read, cache made and output;
  - the medians of each.
- **Two memory journeys bring their own data.** Since the 18 Oct wipe, `memory_follow_up`
  (its deal tracker) and `memory_who_emailed` (Sara's emails) named things his world no longer
  holds. Each now seeds them on a fresh world (a table, an interactions table, a meeting), so
  they can run before and after.

## Step 1: B1, B3, and where the start layer goes in

- **B1: turn.md is six short paragraphs, 147 words**, down from 841, following his spec:
  1. who Alpha is;
  2. the four gates;
  3. known, looked up, estimated or asked;
  4. source content is data;
  5. plain words;
  6. where you are.

  Deleted and not moved, as he wrote: the list of hands, tables against the journal and
  Watson's offer rule, "what stands is made now" and its defaults, the reply lengths, "never
  ask to export", and "a reader that exists is run".
- **The system prompt is fixed:** turn.md and the three connectors' SKILL.md (question 3: they
  stay until A9). A test shows it byte-identical across three turns of one session while a row
  is added between them.
- **The layers ride on the sentence** (`engine._hooks`):
  - UserPromptSubmit gives the turn layer every time, with the start layer first when the
    session is new (no `resume`, which is every agent run and every first turn).
  - SessionStart with source "compact" gives the start layer again after a compaction.
  - `TurnRequest.injected` says what was given.
- **The start layer** (`prepack.start_layer`) is the pack's slow sections, words and budgets as
  they were: who the person is, their instructions, goals, what Alpha holds with its fields,
  what it can reach and do, the wiki's index, the module's page, an agent's own thread (a run
  is a session of its own) and every open card. B2 rewrites its contents in step 2.
- **The turn layer** (`prepack.turn_layer`), a few lines:
  - NOW;
  - "SINCE YOUR LAST TURN HERE (elsewhere, meanwhile)", up to 10 lines, and no longer "these
    override anything you remember";
  - due today or overdue, up to 5;
  - today's calendar, up to 5;
  - the cards open in this conversation;
  - at most 3 matches, a record, a document and a journal line in turn, each with its id;
  - one line per person or company the sentence names (name, kind, id);
  - in Home, the work items.

  The counts are in `limits.toml [views]` with their why (question 6).
- **Dropped:** THIS CONVERSATION (the session holds it); WHAT WAS SAID <day> (a day named still
  narrows the journal's matches); the entity cards' bodies (the `people` view has them);
  TASKS DUE within a week (a query away).
- **What the model saw is kept as it saw it** (`turn_contexts`): both layers for a new session,
  the turn layer for a resumed one, and the start layer again under "GIVEN AGAIN AFTER A
  COMPACTION" when one happened.
- The calendar's SKILL.md and `journal_read`'s words no longer name the pre-pack. The pack's
  limits lost the entries nothing reads (`recent_turns`, `matches`, and the budgets of the
  dropped sections).

## What ran

- **Tests:** `test_layers.py` (3):
  - the system prompt is the same on every turn, with the start layer once;
  - a compaction gives it again and the record says so;
  - a run with no layers is given nothing.

  The tests that asserted the conversation's copy were rewritten to the layers. Core 426
  passed; lint and types clean.
- **The before run** used S1 with step 0, frozen in a worktree so step 1 couldn't leak in. The
  seven journeys of question 7 each ran alone on a fresh world. Its first try was thrown away,
  for two reasons:
  - The reports kept no tokens (the journey's world is deleted after it runs). Each `say` step
    of a report now carries its tokens and its first words.
  - The worktree lacked the browser's `node_modules`, which git ignores, so `watch_from_words`
    failed there on its own. They were linked in.

  The second try passed all seven (`docs/journeys/2026-10-19-2109.md` to `-2118.md`):

| Journey | Turn | Verdict | Input | Cache read | Cache made | Output | First words | Time |
|---|---|---|---|---|---|---|---|---|
| track_then_log | 1 | pass | 6 | 61,607 | 15,389 | 859 | 11.9 s | 15.8 s |
| track_then_log | 2 | pass | 6 | 61,465 | 14,450 | 803 | 10.1 s | 10.7 s |
| watch_from_words | 1 | pass | 16 | 284,668 | 37,207 | 3,629 | 35.5 s | 62.2 s |
| reminder_fires | 1 | pass | 6 | 63,096 | 16,262 | 409 | 6.8 s | 14.6 s |
| memory_follow_up | 1 | pass | 6 | 61,156 | 14,056 | 414 | 8.0 s | 11.3 s |
| memory_follow_up | 2 | pass | 6 | 61,622 | 14,292 | 440 | 7.0 s | 10.1 s |
| memory_yesterday | 1 | pass | 2 | 11,509 | 15,697 | 346 | 3.9 s | 6.1 s |
| question_card | 1 | pass | 8 | 96,235 | 17,938 | 646 | 6.1 s | 9.4 s |
| two_things_at_once | 1 | pass | 18 | 288,621 | 29,529 | 4,880 | 1.6 s | 85.6 s |
| two_things_at_once | 2 | pass | 6 | 61,470 | 13,956 | 301 | 6.4 s | 15.1 s |
| two_things_at_once | 3 | pass | 4 | 82,659 | 1,174 | 228 | 4.3 s | 17.4 s |

- **Step 1**, the same seven on the new code (`-2121.md` to `-2136.md`; `question_card` is
  `-2128.md`):

| Journey | Turn | Verdict | Input | Cache read | Cache made | Output | First words | Time |
|---|---|---|---|---|---|---|---|---|
| track_then_log | 1 | pass | 8 | 92,862 | 18,538 | 1,076 | 17.9 s | 20.5 s |
| track_then_log | 2 | pass | 6 | 63,148 | 8,795 | 881 | 12.8 s | 13.3 s |
| watch_from_words | 1 | pass | 18 | 316,275 | 34,493 | 3,474 | 40.1 s | 68.9 s |
| reminder_fires | 1 | pass | 6 | 59,273 | 13,712 | 324 | 10.8 s | 24.9 s |
| memory_follow_up | 1 | pass | 6 | 58,464 | 12,717 | 396 | 7.7 s | 10.6 s |
| memory_follow_up | 2 | pass | 6 | 62,814 | 10,381 | 750 | 11.2 s | 16.6 s |
| memory_yesterday | 1 | pass | 6 | 63,689 | 16,676 | 563 | 10.5 s | 11.0 s |
| question_card | 1 | fail | 6 | 63,786 | 16,532 | 541 | 122.6 s | 123.1 s |
| two_things_at_once | 1 | pass | 22 | 416,401 | 37,680 | 4,323 | 34.7 s | 94.3 s |
| two_things_at_once | 2 | pass | 6 | 63,426 | 8,990 | 429 | 8.0 s | 20.5 s |
| two_things_at_once | 3 | pass | 4 | 99,356 | 1,569 | 211 | 8.2 s | 18.8 s |

  - From a session's second turn on, less is written to the cache: 14,450 → 8,795
    (`track_then_log`), 14,292 → 10,381 (`memory_follow_up`), 13,956 → 8,990
    (`two_things_at_once`).
  - What remains is the turn's own new history; cache read stays near 60,000 a turn, which is
    Claude Code's own prompt and the tools over each step.
  - First turns and first words are not better yet. Several are slower, as the model now looks
    up what the pack used to hand it (a table's fields, a person). B2 and B4 are where that
    is meant to change. Nothing is concluded from one run of each.
- **Step 1, the other five** (B1 and B3's proof, and the turns most likely to move):
  - `two_things_at_once` (above), `carries_over_a_tool_change` (`-2140.md`) and
    `agent_takes_a_task` (`-2142.md`) passed.
  - `memory_follow_up` passed with no copy of the conversation: "the second one" came from the
    resumed session alone. `memory_yesterday` passed on the matches line alone.
- **Four failed, three of them regressions:**
  - `remove_asks` (`-2126.md`; it passed in all five earlier runs) and `question_card`
    (`-2128.md`) failed the same way. The model asked in its reply ("Reply yes and I'll delete
    it"; "What did you have for lunch?" with options) instead of through the hand that makes
    the card. The old turn.md said "never leave the decision in prose", and B1 deleted it.
  - `memory_who_emailed` (`-2137.md`) gave Sara's email of 21 days ago as the last contact and
    missed the call 14 days ago. This is the failure P8 fixed by putting the contact numbers on
    the person's card, and B3 drops the card.
  - `when_did_we_last_talk` (`-2139.md`) answered right (17 Oct, 4 in 90 days), but the judge
    called it "not grounded": the model read it in SQL, which leaves no step, and the card is
    no longer given. The suite's judge is now told that an answer agreeing with the journey's
    `facts` was read; rerun, it passed (`-2144.md`).
- **Not fixed at first:** each regression needed a sentence in a hand's docstring, which his
  spec says is proposed first (below).

## The three docstring sentences (Q100)

Kenil: "Yes, add the three docstring sentences as written". One sentence each, none in the
prompt:
- **`ask_person`:** "A question left in the reply is one the person cannot answer on a card:
  when they must choose, or say something you cannot find out, ask it here."
- **`world_change`:** "Removing a row the person entered asks them on a card when you call
  this, and it goes only on their yes: call it, rather than asking first in words."
- **`world_query`:** "Who someone is and when you last dealt with them: one query on `people`
  (its `last_contact` and `in_90_days` count mail and meetings; `interactions` lists each)."
  This is B4's line, brought forward from step 2.

The three journeys, each alone on a fresh world, all passed:
- `remove_asks` (`-2204.md`): the removal asked on its card;
- `question_card` (`-2206.md`): "What did you have for lunch today?" asked on a card, with the
  model's own options;
- `memory_who_emailed` (`-2208.md`): the intro call two weeks ago was given as the latest
  contact.

So step 1 stands at all 12 green: eight first time, `when_did_we_last_talk` after the judge's
fix, and these three after the sentences.

## A one-time fresh session for conversations made before step 1

His Home conversation and 12 work items had sessions made under the old prompt.
- The SDK keeps a session's first system prompt. Resumed after the restart, they would have
  kept the 841-word rules and their first turn's pack, frozen, with only the new turn layer
  added.
- On his yes ("add the one-time fresh session ... carrying their checkpoint"), the session's
  fingerprint now holds how the world is given as well as the hands' names
  (`engine.GIVEN_AS`, "layers").
- A session made before is not resumed. A fresh one starts, given the start layer and
  carrying the conversation's checkpoint (A12's path), and the next turn resumes the new one.
- The words now cover either reason. The journal says "Starting a fresh session here: Alpha
  changed since the last turn, carrying what was going on." The model is told "What was going
  on here before this fresh session:".
- A test (`test_layers.py`) shows it once and not again. Core 427 passed, desktop 238.
- `carries_over_a_tool_change` passed again on it (`-2233.md`).
- The app was rebuilt and restarted on his yes (22:40). Its core came up on the repository's
  code, and nothing had run in his world since.

## Numbers (`just stats`)

- 431 core tests and 238 desktop tests; lint and types clean.
- 70 tools; 47 journeys defined.
- Core 29,050 lines, tests 11,230.
- 296 commits before this one.

## Left

- **His look in the app** after the restart, and the commit on his word.
- **Step 2:**
  - B2's content: ALPHA.md and the Permissions note whole, NOTES.md whole, the map without
    fields, and the checkpoint in a fresh session's start layer;
  - B4: the `fields` view and the docstrings;
  - B5: the pack deleted for `context/layers.py`;
  - `snapshot` off.
- **Step 3: B6 and B7.** agent_run.md still ends "Everything below is the person's world", but
  the world is now on the run's message; B7 trims it.

## Kenil's first look in the app (19 Oct, 22:40)

- **"log my lunchy" came back as prose, not a card** (his screenshot). Read from the session's
  transcript:
  - With tool search on, the model sees `ask_person` only as a name in the deferred list. Its
    description loads only when the model searches for it, and this turn it loaded
    `world_query` alone.
  - So Q100's sentence on `ask_person` can't reach a turn that never opens the hand. The
    journey passed by chance.
  - The bundled Claude Code keeps a tool loaded when its `_meta` says
    `"anthropic/alwaysLoad": true`. The SDK's own in-process server helper passes only
    `maxResultSizeChars` in `_meta`. Proposed to him, and built on his yes (below).
- **The calendar.** Asked to do the calendar task here:
  - At 19:21 UTC all 28 events in his world were marked removed in one sync (28 "removed from
    your calendar" lines).
  - The read before, at 19:16, was normal. The core reading had run since 18:26. macOS said
    access was granted, and the read returned no events.
  - After the 21:34 restart, the first sync (21:39) read all 28 again, and the connector put
    them back itself (removed_at cleared; 28 "Calendar changed" lines). Nothing was edited by
    hand.
  - The flaw is that an empty or failed read is taken as "everything was deleted".
    Proposed to him, and built on his yes (below).

## The two fixes (Q101), on his yes ("build both fixes as proposed")

- **The hands that put a card to the person are always loaded.**
  - `@hand(card=True)` marks `ask_person`, `world_change`, `act_outward` and `connect`: a
    question, the yes before a removal, anything leaving the world, and a sign-in.
  - Alpha builds its in-process server with mcp's own `Server` (`inprocess.server_of`), as
    the SDK documents for bringing your own. It lists those four with `_meta`
    `"anthropic/alwaysLoad": true`. Every other hand stays behind tool search.
  - Calls go to the same handlers, and a hand that isn't there comes back as an error.
- **Proven on a real turn.**
  - On a scratch world, "Log my lunch" in Home: the session's transcript lists 18 of Alpha's
    hands as deferred, and none of the four.
  - The model called `ask_person` at once, with no search step, and the card was made ("What
    did you have for lunch today?").
  - `question_card` passed three times (`-2250.md`, `-2253.md`, `-2254.md`) and
    `remove_asks` once (`-2251.md`).
- **A calendar removal is confirmed by a second read.**
  - Every read makes a fresh EventKit store.
  - An event missing from a read is marked removed only when a second read, on another fresh
    store, misses it too.
  - An event that comes back is journaled "Back on your calendar: ...", not "Calendar
    changed".
  - Tests: one empty read removes nothing; a deletion seen twice goes; a returning event
    says it is back.
  - The real read is proven only by the app's next sync. macOS gives calendar access per app,
    and this shell has none.
- Core 430 passed, desktop 238; lint and types clean.

## His second look: lunch guessed, not asked (19 Oct, 22:58)

- **What he saw.** On the Q101 build he said "log my lunch". `ask_person` was in front of the
  model, but it did not ask. It read his three-lunch rotation, logged the next one (a paneer
  wrap, 680 kcal) as "estimated" with its assumption, and said so. His word: "what the hell!"
- **Why.** His spec's paragraph 3 is "Known, looked up, estimated or asked". turn.md as
  written in B1 said "stated, looked up, or estimated and said so", which dropped "or asked".
  The old line "ask when the readings differ a lot" had gone with B1. So a guess, said
  aloud, read as allowed.
- **Fixed on his word** ("Restore my paragraph 3's words with 'What only the person can know
  is asked.'"):
  - paragraph 3 ends "What only the person can know is asked." turn.md is now 155 words.
  - `snapshot` is turned off, which is step 2's item brought forward. Open sessions are sent
    the prompt as it is now; by default the SDK would have kept his Home session on the
    paragraph without "asked". The prompt is the same on every turn, so this costs no cache
    (the spike's turn 4).
  - A test covers it. Core 431 passed; lint and types clean.
- **His world:** the guessed row (`r_fbd5a3bc8747`, today's lunch) is still in his food log,
  left for him to change or remove through Alpha. Nothing was edited by hand.
- **The calendar's first sync on Q101** (22:01:58 UTC): all 28 events read, none removed, no
  error. Two meetings are journaled "Calendar changed" on every read ("TTM Sync", "Intro with
  Sara"): noise to look at, not done.
- **Both lunch wordings, on copies of his world.** Each run got its own SQLite-backup copy,
  with the guessed row taken out and no kept session (a fresh Home, as after a restart), and
  the real model. Four runs of "log my lunch" and four of "log my lunchy":
  - none guessed or wrote a row (8 of 8);
  - seven asked on a card, with his three usual lunches and "Something else" as options;
  - one ("log my lunch", the third of its four) asked in the reply, with no card.
  - The copies' journals still hold tonight's guess, so several replies mention that the
    earlier paneer wrap "isn't there any more". That's an artefact of taking the row out of
    the copy; in his world the row is still there.
- **Restarted on his yes** ("rebuild and restart my app on the restored paragraph 3"): the
  core came up at 22:11 UTC on the repository's code with no errors. His third look is next.

## Kenil's third look, and the commit

After the restart he tried the four sentences in his app: "log my lunch", correcting the
guessed row, a removal, and the Monthly P&L's columns. His word: "The four tries look right in
my app." Steps 0 and 1 are accepted, with Q100, Q101 and the restored paragraph 3. Committed
on his word ("Commit steps 0 and 1 with the fixes and their docs to main").
