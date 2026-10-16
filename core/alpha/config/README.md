# `alpha/config/`: every static thing, out of the code

Read by `alpha/config.py`. Three kinds of thing live here and nothing else (16 Oct 2026, with
Kenil: prompts, models and settings maintained cleanly and apart from the code, so they change
without touching a code file; still versioned with it, still judged by the journeys).

| What | Where | Read | Changed how |
|---|---|---|---|
| The model's instructions | `prompts/<name>.md` | on every use, cached by the file's time: an edit reaches the next turn, no restart | edit the file; `{{name}}` placeholders are filled by the caller |
| A built-in agent's default brief | `briefs/<kind>.md` | when the agent is first made in a world | edit the file; worlds that already have the agent keep the person's copy |
| Which model does which work | `models.toml` | once at start | edit; `ALPHA_MODEL` and `ALPHA_SYSTEM_ONE_MODEL` override for checks |
| The named judgements and timings | `limits.toml` | once at start, typed and validated | edit the number and its why; a missing or wrong key stops the core with a plain message |

What stays in the code: the walls and checks (the gates, the write list, the parsers that read a
model's answer, which a prompt describes but the code enforces), the schema, the words the person
reads, the enumerations the code switches on, and discovery lists (where Node or Chrome may be).
Nothing here is a setting the person meets, and nothing is read from the person's data
directory: an install cannot drift from its code.

## Prompts

| File | Who reads it | The code that reads its answers |
|---|---|---|
| `turn.md` | every turn with the world as tools | `runtime/turn.py` |
| `agent_run.md`, `agent_mention.md` | a custom agent's run; an agent answering an @ | `runtime/agents/runner.py` |
| `watson_exchange.md`, `watson_checkpoint.md`, `watson_document.md`, `watson_refile.md` | Watson's passes (JSON answers) | `runtime/agents/watson.py` (`parse`, `apply`, `refile`) |
| `repair_reader.md`, `repair_procedure.md` | Alpha repairing its own know-how | `runtime/pipeline.py`, `runtime/acting.py` |
| `check_independent.md`, `check_judge.md` | the second opinion | `runtime/check.py` |
| `judge.md` | the System One seam (a typed question, JSON) | `runtime/judge.py` |
| `asking_parser.md` | the parser that turns a question in prose into a card | `runtime/asking.py` |
| `connecting.md` | the map's suggested links | `runtime/connecting.py` |
| `workflow_build.md` | the build in a module's walled workspace | `runtime/workflow_build.py` |
| `route_trial.md` | the one tool call that proves a route answers | `runtime/route.py` |
| `codex_guard.md`, `codex_independent_guard.md` | the ChatGPT route's AGENTS.md | `runtime/codex_cli.py` |

A prompt and its parser change together, in one commit, and `just journeys` is the judge.
