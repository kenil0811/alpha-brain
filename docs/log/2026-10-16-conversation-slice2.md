# The conversation, slice 2: one timeline, the card frame, the question card (16 October 2026)

Kenil: "ok do it", after slice 1 and its core's part. Slice 2 of `../design/conversation-proposal.md`:
visuals 5 to 9, and everything in one timeline.

**One timeline** (`assistant/AssistantPanel.tsx`). Everything in the order it happened: the
person's sentences and Alpha's replies, the questions where Alpha asked them, the workflow pages
and the actions where they were proposed, the threads where they began, the running turn last.
Nothing is pinned on top and nothing is pushed to the bottom any more (before: thread cards
above, then the turns, then every workflow, action and ask under them, whatever the order). The
core's conversation now includes the `asked` entries (`api/conversation.py`), so a question has
a place: an open one is its card (several from one turn, one form), an answered or skipped one a
dim line, "Alpha asked · …". A question the model journals while its reply is still being
written sorts after that reply, as the person reads it (found in the pane: the card sat above
the reply).

**The card frame** (`ui/Card.tsx`, a kit primitive with its test): an eyebrow, a title row with
its badge, the body, a row of buttons at the foot. The question card, the action card ("Alpha
would send" / "Alpha would prepare" as the eyebrow) and the workflow page ("Your workflow") take
it, so the three look like one thing, in the panel, on the Assistant page and on Home.

**The question card** (`assistant/AskCard.tsx`). The options as rows with a dot, or ticks when
several may be chosen (`ask_person`'s `kind`, `choose` in the API), the key number at the right
of each row, "Say it your way" as the last row with the model's hint as its placeholder,
Answer and Skip. Keys 1 to 9 pick a row and Enter answers, when the card and not its input has
the keys. A question on its own answers on a tap (one step, as before); several ticks or typed
words go with Answer; questions asked together stay one card with numbered sections and one
Answer (11 Oct). A thread is a compact row (`assistant/ThreadRow.tsx`): title, state, the live
step in words, "open". A failure is the quiet row of slice 1, folded with its count.

**Checked.** Desktop: 216 tests pass (new: the frame; a row picked by its key answers at once;
several ticked and sent joined, the hint as placeholder; the timeline's order with a folded
question, a thread's row at its time, and a question journaled before its reply shown after
it); typecheck clean. Core: the conversation's tests pass with the `asked` entries; ruff and
mypy clean. `just check-desktop assistant home`: `docs/checks/2026-10-16-1923.md`, 3 of 3 pages
clean. **Ran for real** in the pane on a copy of Kenil's world: "Log my lunch" came back with
"What did you have for lunch?" as the card, the model's own hint ("e.g. 'chicken salad' or 'a
sandwich and fries'") in its row, after the reply; the Deal Tracker conversation read in order
with its link rendered; Home's lane showed the same card in the panel. Home's own Needs-you
form for a single question keeps its old markup (its group card already uses the new one); the
app is not yet rebuilt with this slice.
