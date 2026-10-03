# §4.18 The conversation, Claude-like (2 Oct 2026, late evening)

*Moved verbatim from `build-plan.md` §4.18 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.18" mean this file.*


Kenil: "very similar to claude, thinking, getting the thinking messages, the motion when it's
thinking, it should give me options for questions and not just have me type in".

- **The run is streamed.** `claude -p` now runs with `--output-format stream-json --verbose`;
  `claude_cli.run` reads events as they arrive and keeps, per turn and thread, what the model
  is doing in plain words (`LIVE.progress`: the latest interim text as `thought`, the current
  tool as `doing` through `plain_tool`, a tool count); the `result` event ends the run as
  before (`parse_result`; `parse` still reads a whole output for tests). `/api/turns/{id}`
  and every thread view carry `live`.
- **The panel** shows a Claude-like working state: a pulsing dot, a shimmering headline (the
  current step in words, else "Thinking"), animated dots, the elapsed clock (keyed on the
  turn's id, so it no longer restarted on every poll), the model's interim thought in italics,
  and the steps collapsed behind "N steps ▸" with the latest shown. Home's working-thread card
  shows the same live line.
- **Questions are choices.** The conversation returns open asks; the panel renders each as a
  card with its options as pills, "Or say it your way", Answer and Skip; tapping an option
  posts the answer, which starts the next turn, and the panel follows it. Rule 10 tells Alpha
  to ask with 2–4 options when the answers are a few natural choices, and not to repeat the
  question in prose. Checked in the browser pane on a copy of the world: a planted "Which size
  was the shake?" with three options; "330 ml" posted the answer, "Thinking · 7 s · Stop"
  showed, the shake was logged with that size.
- **A step removed from every turn.** The stream showed the model's first step on each turn
  was Claude Code's own ToolSearch: with 70 MCP tools, Claude Code deferred their schemas
  behind a search. Runs now set `ENABLE_TOOL_SEARCH=false`, so every schema is in context up
  front. The cost is context per turn; the gain is one fewer round trip on every turn.
  Measured (one run each, the same question "how many deals do i have, and from how many
  sites?" on a copy): 34 s with tool search, 40 s without. One sample is noise, not a verdict;
  the step is gone, the time did not move. Leave it off for the simpler run, and measure
  across the journey suite before deciding anything more.
- 135 core tests (a streamed run is watched and read); lint and types clean; the app rebuilt.
