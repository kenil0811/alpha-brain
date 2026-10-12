# Questions asked together are answered together (11 October 2026, night)

Kenil asked for a personal trainer. Alpha asked three questions in one turn, each as a card
with choices (the interview rule: "two or three at a time"). He tapped a choice on the first:
the tap sent a turn, and the two cards beside it vanished. Alpha replied that it still needed
the other two answers; "give me the questions again"; Alpha wrote them out as prose.

Why: the person's next words in a conversation answered every open question of the previous
turn there (`close_answered_asks`), right for words typed in the composer, wrong for a tap on
one card among three. And each card sent itself.

## Built

- **One form per turn** (`AskGroup`, `groupAsks` in `assistant/AssistantPanel.tsx`;
  `groupNeeds` on Home): the open questions of one turn show as one form, numbered, each
  with its choices to tap (a tap selects, it sends nothing) or words to type, and one Answer
  for all of them. Answered in part, "Answer 1 of 3" sends what is answered and the rest stay
  open as their own cards. Skip all dismisses them. A question on its own, or one the core
  derived from prose, keeps its card.
- **One turn for all the answers** (`POST /api/asks/answer`, `client.answerAsks`): each answer
  is journaled on its own question; the turn carries one message, a line per question
  ("What should it do? — Both"), in the conversation that asked.
- **A card's answer answers its own question**: when any question of a turn was answered on
  a card, the next words close nothing else; words typed with nothing answered on a card
  still answer every question of the turn.
- The rule to the model says the questions of one turn show as one form and come back as
  one message.

**Checked.** Core: the form answering two of three in one turn with the combined message, the
third answered on its card closing nothing else, an empty form refused; the tap-leaves-the-
siblings rule and the typed-words rule. Desktop: the form gathers taps and words and sends
once, a tap alone sends nothing, grouping by turn with a lone and a derived question apart.
269 core tests, 89 desktop, lint and typecheck clean. Not yet run for real: the next interview
in Kenil's app is the run.
