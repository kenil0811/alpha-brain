# feat/ui-rulebook merged with main (9 October 2026)

Vikas asked for a pull request; main had moved eight commits on (reliability first, agents
schedule-first (Q33), Alpha on another Mac (Q34)) and nine files conflicted. He chose to merge
main into the branch first.

**How the two sides were reconciled.**

- **Agents.** Main's Q33 makes every automation an agent's process (a goal, a page, a verdict per
  run judged by code). The branch had Agents (Alpha and each module's runner) and Automations as
  two tabs. Merged: one **Agents** tab, the standard data view over the automations with Goal and
  Last verdict columns, each row wearing the companion chosen for that agent; `#/intelligence/automations`
  opens it. An agent's page keeps the branch's layout and gains main's goal, verdicts, runs with a
  verdict each, and **its page**, which saves for real through the existing note route
  (`agent:<id>`); its title, schedule and steps stay disabled (no core route); a Companion card
  picks its look. The list row (`AutomationList`) shows the goal and the verdict as chips in the
  five tones. The branch's Alpha-and-runners source is gone; the egg still draws Alpha and the
  module runners from `agents.ts`.
- **Settings and first run.** Main's browser row (Alpha's own Chromium) is a card, "Reads with",
  in the branch's grid; first run asks for both as on main. The branch had removed the "Ask Alpha"
  button (the panel folds to a strip); it stays removed.
- **Numbering.** The branch's decisions were Q33 (the UI rulebook) and Q34 (the UX guidelines v2),
  clashing with main's. They are **Q35** and **Q36** now, in the design, STATE and the branch's
  log entries (each says what it was).
- **The design doc.** The branch's docs commit 2f427a5 (9 Oct) had cut
  `design/alpha-second-brain-design.md` from 644 lines to 132 by mistake. Restored from main and
  the branch's own changes put back: §8's status box (now with the owner's review and the merged
  Agents), the "superseded" note on layout, the Q35 and Q36 rows.

**What ran.** `just stats` after the merge: core 223 passed; desktop 278 in 42 files (1
skipped), typecheck clean; lint clean. The window looked at in a browser against a scratch core
(started before the merge, so main's browser route answers 404 there): Intelligence › Agents
draws the data view with Goal and Last verdict; Settings shows Reads with. The scratch world has
no automations, so an agent's row and page with real verdicts were not seen. Not run: journeys,
`just check-desktop`, the app.
