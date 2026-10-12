# main's Q35–Q38 merged into the rulebook window (11 Oct 2026)

`origin/main` merged into `feat/ui-audit-fixes`. Main's behaviour kept whole, in the window's
look and rules (`design/ui-rulebook.md` §17). Proven by tests only: nothing ran in the app or
through `just check-layout` after the merge.

**Numbering.** Main's Q35–Q38 (the conversation closer to Claude, a plan's questions, the
research pass, modules as programs) keep their numbers. The window's own Q35–Q38 (the UI
rulebook, the UX guidelines v2, the owner's second review, the audit decisions) are Q41–Q44
now, in the design's §11, the rulebook, `core-changes-for-the-window.md`, STATE and the
window's log entries.

**What came in, and how it looks here.**
- The Assistant page (`#/assistant[/<id>]`): from ⌘K and its address. Not in the sidebar:
  rule 3 forbids extra destinations (main had it above Intelligence). While it is open the
  side panel stays folded (`app--assistant-folded`, main's `app--assistant-hidden` dropped);
  the strip's open says why it can't, and the panel's edge button is not shown there. Main's
  floating "Ask Alpha" button is dropped: the edge button and the strip already reopen the
  panel (rule 29). On the page the header has no picker or New (the page's own list does
  that) and no bell (the folded strip's bell is the one).
- The reply as it is written, with the last three steps (icons, not ✓/✗); question cards; a
  reply without the questions its cards carry.
- A plan's questions and a researched plan's pieces: in `assistant/Cards.tsx` beside the
  window's PlanCard, re-exported from the panel for main's callers; the block notes moved into
  an InfoTip (no subtitles). The button stays **Approve** (main: "Build with these"), and
  carries the answers and decisions; on Home's proposals too.
- Main's CSS converted to tokens (one measure, `--assist-measure`, as a custom property).

**Tests adjusted.** `plancard.test.tsx` clicks "Approve" rather than "Build with these";
`conversation.test.tsx` gives its fake client the `preference` call the window's avatar makes;
`AssistantPanel.test.tsx` expects `approvePlan("p1", undefined, undefined)`.

**Numbers.** Desktop 478 passed, 1 skipped; core 247 passed (main's, unchanged); typecheck,
ruff and mypy clean.
