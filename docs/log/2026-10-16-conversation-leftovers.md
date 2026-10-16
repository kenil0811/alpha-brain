# The conversation, the two leftovers: Home's question, and several at once (16 October 2026)

Kenil: "lets get into those as well", after the three slices. The two things the slices left.

**Home's question is the card** (`shell/Home.tsx`). A single question in Home's Needs-you lane
was still its own form (a title, "Alpha asked … because the answer changes what it builds",
option buttons or an input, Dismiss); it is now the same question card as in the conversation
(`AskCard`), with its rows, keys and hint. The group of questions from one turn already was.

**Several at once, for real** (`config/prompts/turn.md`, rule 10; `assistant/AskCard.tsx`).
The rule now says `kind="several"` when more than one answer may apply, and that an open
question carries a hint of the shape of the answer. Tried on a copy of Kenil's world: "I want
to plan workouts this week. Ask me which weekdays suit me, with the days as choices; I may pick
more than one" made the model call `ask_person` with the seven days and `kind="several"`, drawn
as ticks with keys 1 to 7. Pressing the keys did nothing at first: the card was an `article`
that never had the keyboard. Now the card is focusable and takes the keyboard when it appears
(the question is the next thing to do); `ui/Card` takes a ref for it. Then 1 and 3 ticked
Monday and Wednesday, Enter sent "Monday, Wednesday" as the person's words, the question folded
to its line, and Alpha replied "Noted: Monday and Wednesday for workouts this week."

**Checked.** Desktop: 218 tests pass; typecheck clean. Core: the prompt and asking tests pass.
`just check-desktop home assistant`: `docs/checks/2026-10-16-1938.md`, 3 of 3 pages clean.
Ran for real as above, in the pane on a copy of the world. The app is not yet rebuilt with it.
