# The conversation, slice 1, the core's part: a turn pushed as it happens (16 October 2026)

Kenil: "go", once the agents session had committed (Sherlock). The core's half of slice 1 of
`../design/conversation-proposal.md`, left out earlier so as not to touch files that session had
open. Everything here is by mechanism; nothing changes what the model is told except one
sentence.

**A turn pushed as it happens** (`api/conversation.py`, `GET /api/turns/{key}/events`). A
`text/event-stream` per running turn: `state` when it changes, `text` deltas as the model writes
(or a `reset` when the core cleared the words at a tool call), `thought`, `doing` (the current
tool in words), one `step` per journal entry of the turn, and `done` with the whole turn as the
poll would give it; `lost` when the core no longer knows the turn. It reads the live state every
tenth of a second and the journal every half second, in process (a dict under the existing lock
and one small query), no new threads, no pub/sub, and ends when the client goes away. `Live`
keeps `written`, the count of characters written so far, so a delta is exact even past the
20,000 characters the core keeps (`partial_chars`); a cleared partial resets it.

**The window follows the stream** (`core/client.ts`: `followTurn`, `followOrWait`,
`applyTurnEvent`, `parseTurnEvent`). `askAndWait` and the answer to a card open the stream with
`fetch` and a `ReadableStream` (the token in the header as every call); each event becomes the
turn so far for the reply element (words appended, the thought and the current step, steps
appended, the state); `done` ends it. The 500 ms poll is the fallback, not the way: when the
stream can't be opened or drops before the end, `waitTurn` takes over from where it was (the
3 Oct rule stays: one missed answer never ends a turn). In the pane, one request per turn
(`/api/turns/<id>/events`) and no poll of `/api/turns/<id>` at all.

**Small things from the proposal's §3.** `ask_person(question, options, kind, hint)`: `kind` is
"one" or "several" (anything else is refused in plain words), `hint` what a free answer should
be; the journal's `asked` entry carries them, the API gives them as `choose` and `hint` (the
conversation's asks and Home's Needs-you), the card's free-text row shows the hint; the rows
for "several" are slice 2. **One automatic retry** (`runtime/turn.py`, `wrote_anything`): a
turn that failed because the route gave no answer or went silent, before it wrote anything to
the journal, runs once more with "Trying again" on the thinking line; a turn that wrote
something, or that the person stopped, never. **Consecutive identical failures folded**
(`views.fold_failures`): the conversation shows the latest once with `repeats`, the window adds
"×6"; the journal keeps every one. **One sentence in `turn.md`** (rule 10): the window renders
Markdown, several things compared may be a table, a source may be a link.

**Checked.** Core: 310 tests pass (new: the stream's events in order with the words, the thought,
the step and the end; an unknown turn a plain problem; the retry only when nothing was written
and never when stopped; the folding; a question's kind and hint through the API and Home);
ruff and mypy strict clean. Desktop: 211 tests pass (new: the event parser and the turn after
each event); typecheck clean. Journey `question_card` passed with the real model (23.8 s; the
card made by the core with two options). **Ran for real** in the pane against a core on a copy
of Kenil's world: "What did I log in the food log this week? Give me a short table by day with
the calories" showed Thinking at 0 s, "Reading rows: food_log" at 5 s, the table drawing
itself at 11 s while the turn still ran, done at 20 s; the network tab showed the one events
request and no poll; no console errors. `just check-desktop assistant home`:
`docs/checks/2026-10-16-1911.md`, 3 of 3 pages clean at every size. Not yet in the Mac app: the bundle on Kenil's Mac is
the one built before this change, so the app rebuilds on his say.
