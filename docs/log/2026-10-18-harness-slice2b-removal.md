# 18 October 2026, small hours — harness slice 2b, step 4: the CLI route removed

The last of 2b's four steps (`../design/harness-slice-2b-proposal.md`). The transition's
fallback goes: the engine is the one way a turn runs.

## What was removed, and what moved

- **`runtime/claude_cli.py`** (579 lines: the `claude -p` subprocess, its flags, its MCP config
  file, the stream-json parsing, the silence watch by killing a process group) and its tests
  (`test_hardening.py`, the CLI-specific tests in `test_turn.py`, `test_asking.py`,
  `test_columbo.py`). What every run shares moved to **`runtime/running.py`**: `TurnRequest`,
  `RunResult`, `Live`/`LIVE` (handles only: a run is stopped through its handle, the engine
  interrupts its session), the tool counts, the result's words (`parse_result`,
  `tools_verdict`), the window's step words (`plain_tool`). Eighteen modules and twenty test
  files import from there now; the ChatGPT route (`codex_cli.py`) among them, unchanged
  otherwise.
- **The engine switch**: `models.toml` `[engine]`, `config.engine_route`, `ALPHA_ENGINE`,
  `route.claude_runner`; `route.run` is the engine or the ChatGPT route by the person's choice.
- **The `skills` and `skill_versions` tables** are no longer in the schema. A world older than
  3 October 2026 still moves its readers and procedures through them (`LEGACY_SKILLS`, made
  only then), `Skills.migrate_from_tables` writes every row out as files, and the tables are
  dropped.
- **Kept, said so:** `alpha mcp` and `mcp/server.py`, the stdio server, because the ChatGPT
  route still spawns it; the hands are what it serves.

## Not done in 2b, carried

The SDK's own shell and files in a turn (the design's §4 first row): they need the person's
granted folders in Settings (slice 6) to be safe, and go with it. `defer` across a restart
(step 3's note).

## Proven by tests

`just stats`, 18 Oct, small hours: core tests 311 in 26 s (15 CLI-route tests gone with the
route); desktop tests 218; journeys 27 defined (`remove_asks` new); commits 254; lines core
21,068 Python, tests 7,884, desktop 18,943; ruff and mypy strict clean. (`just stats` counts
`@tool` decorators as "tools", 67: those are the operations; the model sees 21.) The migration
of the tables on a copy of Kenil's live world: both tables gone after the open, the five skills
read from their files. For real on a fresh world after the removal: `track_then_log` passed in
20 s (`../journeys/2026-10-17-2217.md`). The app restarted on it.
