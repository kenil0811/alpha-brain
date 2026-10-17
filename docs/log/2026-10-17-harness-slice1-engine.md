# 17 October 2026 — harness slice 1: the engine in place of the route

The first slice of the harness design (`../design/alpha-harness-design.md` §18;
`../design/harness-slice-1-proposal.md`, Kenil's yes the same evening; the spikes in
`2026-10-17-harness-slice1-spikes.md`). Every Claude turn now runs through the Claude Agent SDK
instead of a `claude -p` subprocess. Nothing the person sees changes; what is underneath does.

## What was built

- **`runtime/engine.py`.** `run(req) -> RunResult` with the CLI route's own `TurnRequest` and
  `RunResult`, so `turn.ask`, the agents, the builds and the journeys are untouched. Inside: a
  `ClaudeSDKClient` per run on a loop of its own (turns already run on worker threads; called
  from inside a loop it takes a thread of its own); `options_for(req)` carries the same walls
  the CLI got as flags (the allowed and denied tools, `dontAsk`, `setting_sources=[]`,
  `strict_mcp_config`, the preset system prompt with Alpha's rules and the pre-pack appended,
  `no-session-persistence` unless a live conversation, `resume` by the thread's session id, the
  build's `tools` and its sandbox settings JSON, `USER` and `ENABLE_TOOL_SEARCH` in the
  environment, `ALPHA_*` blanked for a build); `cwd` is a `sessions/` directory beside the
  world, so every session's transcript sits under one project key of the default config home,
  apart from the person's own (a private `CLAUDE_CONFIG_DIR` is not signed in). The stream is
  `absorb`ed message by message onto `claude_cli.LIVE` (the reply's text as it is written, the
  thought, what it is doing, the tool count) and into a build's step lines; the result message
  goes through the CLI's own `parse_result` and `tools_verdict`, so signed-out, out-of-steps,
  every-tool-failed and cut-off keep their words. A `PreCompact` hook says "Summarising the
  earlier steps to make room".
- **`mcp/inprocess.py`.** The world's tools served inside the core's process: `Tools` bound to
  the turn, thread, module and actor (as the stdio server was through its environment), each
  tool's JSON schema and description taken from fastmcp (the same words the model read before),
  each call validated and serialised by fastmcp and run on a worker thread so a slow hand never
  blocks the stream; a validation failure or an exception comes back as the tool's error, which
  the model reads. `runtime/` may not import `mcp/`, so the tools package installs the builder
  into the engine when it is imported; `cli.py` imports it for every command; a turn with no
  builder fails in words ("Alpha's tools are not wired into this process") rather than running
  without its hands.
- **`claude_cli.Live`** knows session runs beside processes: a stop handle per run, `stop`
  calls it (the SDK's `interrupt`), `running` sees both. A Stop pressed while the tools are
  still being set up is remembered and honoured as soon as the session exists (a race the
  tests found).
- **`config.py` / `models.toml`:** `[engine] route = "sdk"` (with its why) and `ALPHA_ENGINE`
  to override it for a check or a journey; `route.claude_runner()` picks the engine or the CLI;
  the route's trial goes through the same.
- **`claude-agent-sdk==0.2.168`** pinned in `core/pyproject.toml` (one new transitive package,
  `sniffio`); it bundles Claude Code 2.1.301. The Homebrew `claude` (2.1.278) stays the person's.

## Proven by tests

`core/tests/test_engine.py`, eleven tests with a scripted client in the SDK's own message
types, no model: the options for a turn, a judge, an independent answer and a build; the stream
shown and the result read (text deltas, the thought, two tool calls one failing, the step lines,
the first-text time, the counts); every tool failing is no answer; out of steps is cut off, not
failed; signed out said in words from a result and from an exception; the person's stop (through
the thread's key, from another thread, mid-stream); a silent run ended; the world's tools served
in-process (73 named, a real call answering, a bad argument refused in words); a turn with the
tools not wired failing in words. Two route tests pin `ALPHA_ENGINE=cli` for what they test.

## Ran for real

See below: the journeys on the SDK engine, the same on the CLI, and the numbers.

**On the SDK engine** (a copy of Kenil's fresh world, Sonnet):
- `question_card` passed (`../journeys/2026-10-17-1956.md`): "Log my lunch" answered in
  5.2 s with the question as a card. The SDK's transcript store gained a project key for the
  copy's `sessions/` directory, so the turn did run through the engine, not the CLI.
- `vague_tracker` passed (`../journeys/2026-10-17-1957.md`): two turns, 9.9 s and 39.7 s, web
  searches, three questions as cards, the page drafted with `workflow_draft`, no table and no
  module made: the in-process tools, the stream and the result end to end.
- `branded_food` broke at 0 s in the same report: "There is no module 'Nutrition'". The
  journey's precondition, gone with the world reset of 16 Oct, not the engine; it breaks the
  same way on the CLI (below). The fresh-world set of the design's §17 replaces journeys that
  assume the old world.

**The same two on the CLI** (`ALPHA_ENGINE=cli`, `../journeys/2026-10-17-1958.md`, a minute
later, the same copy's source): `vague_tracker` passed in 246 s (141 s and 105 s a turn) against
50 s on the SDK (9.9 s and 39.7 s); `branded_food` broke on the same missing module. One run
each, with the model's own variance between them, so a sign and not a measurement: the engine
is not slower, and nothing it does differs in outcome. The whole suite on both engines is for
the fresh-world set (design §17), since the old world's preconditions are gone.

**Numbers** (`just stats`, 17 Oct night): core tests 328 in 56 s; desktop tests 219; tools 73;
journeys 25 defined; commits 245 before this slice's; lines core 21,850 Python, tests 8,646,
desktop 18,991; lint and types clean. `alpha turns` has nothing to compare yet: the fresh world
holds no person's turn with timings; the journeys' turn times above stand in.

**Not yet:** Kenil's own "log two eggs" and one question in the app, after `just app-restart`
(the app runs the core from the repository's `.venv`, so the restart is the whole deploy).

## Not done in this slice

The sandbox stays the settings JSON through the SDK's `settings` (the same keys as its
`SandboxSettings`); the journal line for every call stays the tools' own (slice 2's tools bring
the hook); the permission callback path waits for slice 2; `claude_cli.py` stays as the
transition's fallback and goes in slice 2.
