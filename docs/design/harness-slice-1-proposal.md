# Harness, slice 1: the engine in place of the route

*A proposal, 17 October 2026, for Kenil's yes before any code. The first slice of
`alpha-harness-design.md` §18. It changes how every turn is run and nothing the person sees.*

## What this slice is for

Today a turn is `claude_cli.py`: a `claude -p` subprocess per turn with the rules and the
pre-pack appended, the world as a strict MCP server over stdio, `--resume` for a live
conversation, stream-json parsed by hand into the window's events. Slice 1 replaces that
with the Claude Agent SDK behind one interface, so that slices 2 to 6 (the tools, the work items,
the triggers) build on sessions, hooks, a permission callback and subagents the SDK gives,
instead of on process plumbing we maintain. No tool changes, no gate change, no new behaviour:
the point is that everything that works today works the same on the new engine, measured.

## What changes

1. **`runtime/engine.py`, new.** One interface the rest of the core talks to:
   `start(conversation|thread) → session`, `send(session, sentence, rules, context) → events`,
   `answer(permission_request, decision)`, `stop(session)`. Behind it, `claude_agent_sdk`
   (Python, 0.2.168 at the time of writing, pinned): a `ClaudeSDKClient` per live session;
   `resume=` from the session id kept on the thread row (`threads.session_ref`, as today);
   `system_prompt` = the rules and the pre-pack exactly as `claude_cli.py` assembles them now;
   `permission_mode="dontAsk"` with `allowed_tools` the same list as today (the world's tools,
   WebSearch, WebFetch; the file and shell tools denied outside a build, as today);
   `setting_sources=[]` so nothing of the person's own `~/.claude` settings or skills loads;
   `cwd` = Alpha's home (or the module's workspace for a build, as today); the default config
   home kept, because the subscription sign-in lives there (a private `CLAUDE_CONFIG_DIR` is
   not signed in); `USER` set as today. The SDK's bundled binary replaces the Homebrew `claude`
   for Alpha's runs; the person's own `claude` is untouched.
2. **The world's tools served in-process** with `create_sdk_mcp_server` from the same `Tools`
   class, named `mcp__alpha__<tool>` as today, so the prompts and journeys need no renaming. The
   stdio MCP server stays for the Codex route (off) and the CLI fallback below.
3. **Hooks.** `PreToolUse`: the journal line for every call and the agent write-list wall
   (today in the tool wrapper; it moves to the hook so it holds for the SDK's own tools too).
   `PostToolUse`: the result's journal line. `PreCompact`: a journal line saying the session
   compacted, so a later "why did it forget" has an answer. Nothing else in slice 1.
4. **The stream.** The SDK's messages (assistant text as it is written, tool use, tool result,
   thinking, result) mapped onto the window's existing turn events (`/api/turns/{id}/events`),
   same names, so `desktop/` does not change.
5. **`route.py`** picks the engine from `models.toml` (`[engine] route = "sdk"`, with its why;
   `"cli"` keeps today's path). This is not a setting the person meets; it exists for the
   transition and is removed in slice 2 once the five sentences pass.
6. **Builds and agents' runs** go through the same `engine.py` (they call `turn.ask` with a
   `runner` today); the walled workspace's Seatbelt profile (`workspace.py`) is replaced by the
   SDK's `sandbox` settings with `failIfUnavailable=True`, writes allowed to the workspace and
   Alpha's home, reads denied outside them, the network allowlist from the workflow's hosts.
7. **`pyproject.toml`**: `claude-agent-sdk` pinned; `just stats` counts unchanged.

## What does not change in this slice

The 73 tools, the gate, the interview and the workflow page, the five agents, the scheduler,
the window, the prompts. "Track what I eat" still goes to the interview in slice 1; it stops
doing so in slice 2. The design's §18 said "sentence 2 passes" for slice 1; honestly, only its
second half ("log two eggs") can, and that is this slice's acceptance line.

## Spikes first, half a day, each with its answer written in the log

The SDK research (`research/harness-agent-sdk.md`) could not verify five things slice 1 rests
on. Each is a short script against a scratch world, run before the slice is built:

1. The SDK on the subscription with no API key set, from a process started by `alpha serve`
   (the `USER` and config-home conditions of `claude_cli.py`).
2. Two `ClaudeSDKClient` sessions at once in one Python process (two conversations in
   parallel; today two subprocesses).
3. A skill directory written during a session is usable later in that session (the CLI page
   says yes; the SDK pages do not).
4. The event stream carries what the window shows today: partial text, thinking, each tool
   call and result, the final cost and turn count.
5. `can_use_tool` reached for a tool kept out of `allowed_tools`, with the "dummy PreToolUse
   hook plus async prompt" workaround the docs describe, or without it on this version.

A spike that fails changes the slice (for 2: one process per conversation, as today; for 3:
a session restart after a skill is written) and is said so here before building.

## How it is judged

- **Tests:** `engine.py` by unit tests with a fake SDK client (no network, no model); the hook
  and stream mapping by tests on recorded SDK message sequences. `just test`, `just lint`, types
  clean.
- **Journeys:** the whole suite on a copy of Kenil's world with `[engine] route = "sdk"`,
  compared to the last run on the CLI route (`docs/journeys/2026-10-16-*`): every journey that
  passed still passes; the four that act in his accounts only on his say.
- **Timing:** `just turns` before and after on the same sentences; the median today is 25 s, the
  model 23 s of it, Alpha's overhead 1.5 s. The SDK must not add to the overhead; the first
  words' time (2.7–8.7 s today) must not worsen.
- **Acceptance, in the app:** Kenil types "log two eggs" and one question over his tables;
  both answer as today; Activity shows the turn with its steps; a second conversation open at
  the same time answers too.

## What is removed

`claude_cli.py`'s process management, stream-json parsing and MCP config writing (about 560
lines), once `route = "cli"` goes in slice 2. Not before: the fallback stays for the transition.

## Risks, named

- The Python SDK has fewer hook events than TypeScript (no `SessionStart`); slice 1 needs none
  of the missing ones. If a later slice does, the TypeScript SDK runs the engine as a sidecar
  behind the same `engine.py` interface; nothing above it changes.
- The SDK pins its own binary; a bump changes the binary under Alpha. The pin is explicit and
  bumped on purpose, with the journeys run.
- Billing: the SDK draws from the subscription like `claude -p` (Anthropic's support page,
  7 Oct). The same limits as today; nothing new.

## Size

About two to three days: the spikes, `engine.py` and its tests, the hook and stream mapping,
the sandbox settings, the journeys run twice, the docs. Files touched: `runtime/engine.py`
(new), `runtime/route.py`, `runtime/turn.py` (the runner's shape), `runtime/workflow_build.py`
and `workspace.py` (the sandbox), `config/models.toml`, `pyproject.toml`, tests, the design's
§3 status box, the log, STATE.
