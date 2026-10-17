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

## Accepted in the app

Kenil, 18 Oct, 00:48–00:53 (21:48–21:53 UTC), after `just app-restart`: "remove todays food
logs" put the card "Remove "Paneer, lightly air fried" from Food log? …" in the conversation,
his "Yes, remove it" six seconds later removed the row and the reply said so (9.5 s in all);
"which of my connections work at the companies in my job listings" was answered across the two
tables in 10.2 s (three companies, by name: `world_query`'s join); he edited the skill
`linkedin_backend_jobs` on its page (version 2). His word: "ok its working". 2b is accepted.

One failure in his journal from the hours before, worth its lines: at 21:20 UTC the turn that
takes Columbo's second opinion (on "add LinkedIn jobs as well") ended with "No such tool
available: ask_person" (2 of 2 calls failed, 8.5 s). The journal and the session files say
why: that conversation's session was made at 20:14–20:19 UTC on the 72 old tool names (the
core before step 2), the app was restarted on the hands, and Columbo's repair turn resumed it
(`turn.ask` resumes a conversation's `session_ref`, Q21) an hour later: a transcript written
with one tool set, continued with another, and the model called a name the run did not have.
Two things follow. The repair prompt itself still said `records_update`, a name gone with
step 2: fixed in this commit (plain words; the hands are in the system prompt). The resume of
a session across a change of Alpha's tools is the real finding, and it will return with every
update that changes the hands (shipped copies included): proposed with slice 3, not changed
here: a conversation's session is resumed only when it was made with the same tools (a
fingerprint of the hands kept with `session_ref`), otherwise the turn starts a fresh session
and the pre-pack carries the conversation. Nothing in his world is stale now: the one thread
with a session was made after the restart.
