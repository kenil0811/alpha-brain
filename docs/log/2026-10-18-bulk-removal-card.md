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