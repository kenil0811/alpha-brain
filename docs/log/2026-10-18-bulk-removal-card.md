# 18 October 2026 — one card for a removal of several rows; the item says what it waits for

Found in Kenil's first real use of slice 3 (18 Oct, 00:08–00:16 local): "watch Hacker News
"Who is hiring" for remote back-end roles each month" opened one item and made the reader, the
table and the Monday agent in 57 s; he tightened the filter and then chose "Delete the
remaining 50 now". Each removal of one of his rows goes through a permission card, and
`world_change` removed one row per call: fifty cards, one after another. The third sat
unanswered for an hour while the item read "Working", and he asked me to check what was stuck.
Nothing was: the turn waited on him, in words nobody could see.

## What changed

- **`world_change` takes `ids`** (`mcp/tools/hands.py`; `records_delete_many` in
  `tools/tables.py`): several rows the person asked to remove go in one call, each at its
  current revision, one journal line for all of them ("Removed 3 rows from Job listings: Role 0,
  Role 1, Role 2."), the ones that changed or were gone named back. The docstring says why: a
  call per row is a card per row.
- **One card for all of them** (`runtime/engine.py`, `permission_for`): "Remove 50 rows from
  Job listings? "A", "B", "C" and 47 more. They leave the table; Activity keeps that they were
  here.", `records` on the card.
- **The item says what it waits for:** while a permission card is open the item's state is
  `needs_you` and its line "Waiting for your yes: Remove …"; after the answer, `working` and
  "Carrying on after your yes" (or no); a stop says so. Home's lanes and the Assistant list
  move it to Needs you for that time.
- **A list is not a question** (`runtime/asking.py`): a reply ending in a list of two or more
  items that no question introduces makes no card, whatever one item ends with. At 00:09 a
  bullet quoting the thread "Who is hiring?" had become a card, and his "hackernews" answered it.

## Proven by tests

`test_hands`: three rows removed in one call with one line, a missing one named, `ids` without
`remove` refused, a call with nothing refused. `test_engine`: five rows are one card with the
count and three titles; the item reads needs_you and "Waiting for your yes" while the card is
open and working and "Carrying on" after. `test_asking`: the quoted question mark in a list,
and a question that introduces a list still a question. 318 core tests; ruff and mypy clean.

## Ran for real

`remove_asks` (fresh world, the one-row card) rerun after the change: passed in 28 s
(`../journeys/2026-10-18-0027.md`). The app restarted on it. Kenil's open card from the night (the third of the fifty) was
ended by the restart; the 47 rows it never reached are still in his Job listings, for one
sentence and one card now.

## Seen in the app an hour later, and fixed in the same night

Kenil dismissed the dead card, asked the item "whats happening", took the retry it offered,
and got the one card: "Remove 50 rows from Job listings? "Platform Engineer", … and 47 more";
his yes removed the fifty in one go, 45 rows left, the reply four seconds later. The window
showed him none of it: the card sat last, dim, with no reply under it. The core had the reply
(`/api/conversation` returned it); the window had lost it to a race: the load started by the
card's answer resolved after the load started by the turn's end, and overwrote it with the
turns of two seconds earlier. Fixed in `AssistantPanel`: only the newest load lands. Two more
from the same look: a permission card now keeps its own place in the timeline (a derived
question is placed after its reply, which read as "still pending" for a yes already given);
and `#/assistant/<item>` opened on Home's turns, because the first load (for Home) landed
after the address had set the item (the same guard). The core's `/api/conversation` now lists
Home and the day's items, done ones too, so a card in Home shows a done item's state and line
(it read "Started"). 318 core tests, 218 desktop; the app rebuilt and restarted.

A note for the design: a fresh session after a tools change (the fingerprint) loses the
working lists the model held; it re-read the table and chose the fifty by the filter's rule,
and said so; the pre-pack carries the words of a conversation, not its intermediate data.

## The ten-row card (00:44)

"check source name for hackernews to be "Hacker News"" in Home drew a "Which is this about?"
card listing every item on the roster, ten rows. The judge had picked the Hacker News item but
under the confidence (on a copy, the same sentence came back at 0.7 and 0.8: the small model
sits around the line). Two changes: the unsure card offers the judge's own pick, a new item
and here, never the roster; and the item in focus is a structural prior, so the judge's pick
of it stands at any confidence (the person was just there). The card keeps the verdict in its
data. 318 core tests; the app restarted.

## Home's lanes and the cards (00:55)

Kenil: "why are the conversations still open on the main screen? also, these done cards on
chat are not looking good… so much jargon". Home showed a 16 Oct build thread under Working
as "OPEN", with the old build's own words as its line (workspace, `reader_save`), and the
Hacker News card three times in Home's conversation, each with a paragraph. Changed: Home's
lanes hold only what is working, what needs him and what finished today (an item merely open,
between turns or between an agent's runs, is the Assistant page's, under Earlier); an item
nobody touched for a day that no agent owns is stopped at the core's start; a turn that could
not run stops its item with the reason; a card's line is one line; a sentence sent on to an
item that already has its card is a quiet "Sent to X" row, the card itself only where the item
opened; a card with no line of its own says its state, never a step. The words on a card are
the reply's first line: the model's, under the turn prompt's "plain words, no tool names".

Then, at 01:20, on the Done today lane: "only things it needs me for" (Q77). Home's page now
lists the items waiting on him and nothing else, under "Waiting on you"; working and finished
items are the Assistant page's lanes. A stale item stopped at start keeps its own day (the first
version stamped it as today's). The lane's grid let a one-line card push its Open button off the
page; fixed.

## "Hi" (01:30)

"Hi" in Home got a status of his world in three bullets and then a card, "What would you like
to do?", with the three bullets as its choices. Two faults: the model's measure (the turn
prompt gains rule 11: a greeting gets one friendly line, no status, no list, no question), and
the question-reading in `asking.py`: a list of statements under labels is never a reply's
options, and a closing courtesy ("what would you like to do", "anything else") is never a
card. 319 core tests; the app restarted.

## No more rules: the derived cards go (02:00, Q78)

Kenil, on the two regexes added for "Hi": "I don't want a thousand rules, because that will
always mess up… we need a clean simple approach." Agreed and done: a card comes only from the
model's hand (`ask_person`) or a mechanism (a permission, a routing). `runtime/asking.py` (the
trailing-question parser, the list-as-options reading, the "A or B?" rule, the offered choice,
the options seam, tonight's two rules) and its tests are gone, with the `[asking]` limits; the
turn prompt no longer says a prose question becomes a card. The `question_card` journey now
asks that the model use its hand ("Log my lunch" has nothing to log until it knows what): it
passed on a copy of Kenil's world, the model's own card in 6 s (`../journeys/2026-10-18-1110.md`). The
turn prompt itself, twelve rules and 1,800 words, is next: a rewrite to a handful of
principles, as a draft for Kenil to read before it binds.

## The prompt rewritten, and Watson's offer of a table (Q79, 12:00)

The draft shown in chat, agreed with one change: "I don't think every log should be a table…
we need a better and smart way." Live now: `config/prompts/turn.md` is eight short
principles (about 750 words, from twelve rules and 1,800): who Alpha is and its hands; known,
assumed or asked; things the person tracks live in tables, things said in passing live in the
journal; what stands is made now; leaving the world goes through a yes; the person's words;
asking and answering (a choice through `ask_person`, the measure of what was said); where you
are (Home and the items). The readers' and procedures' how-to and the file rules left it for
the hands' docstrings; the walls are in code.

Watson offers a table (`runtime/agents/watson.py`, `offer`): after his pass, the person's
sentences of the last week that Alpha answered without writing a row go to one small
judgement (`config/prompts/watson_logs.md`) that names the kinds of thing among them; a kind
with three sentences in the week (`[watson] offer_after`, `offer_window_days`) gets one
proposal card, "Keep a Walks table? You've mentioned walks 3 times this week (…). I'd keep them
in a table with date, minutes, and put these 3 in."; the judgement runs only when there are new
sentences. A yes starts Alpha's turn with the sentences and their ids ("keep a walks table …
each row's source the sentence it came from"); a no is remembered per kind. Proven by
`test_watson` (one offer, no second judgement without new words, the no remembered, the yes
carrying the sentences into the turn). 315 core tests. The journeys on the new prompt, the real model: `question_card` passed (5 s,
`../journeys/2026-10-18-1153.md`, the second of that stamp); `remove_asks` (28 s) and
`two_things_at_once` (85 s; the watch opened one item, the eggs answered in Home, the schedule
change continued the item) passed in `../journeys/2026-10-18-1151.md`, where `track_then_log`
and `watch_from_words` failed only because the four fresh journeys of one invocation share one
fresh world (they found the Food log and the watch already made and rightly declined to make
them twice: a trait of the suite to fix, one fresh world per fresh journey); rerun alone they
passed, 18 s (`../journeys/2026-10-18-1153.md`) and 41 s (`../journeys/2026-10-18-1154.md`).