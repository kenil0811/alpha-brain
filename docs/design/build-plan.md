# Build plan

1 October 2026. Written so that any session (or person) can continue from here without the
conversation that produced it. The design it implements is `alpha-second-brain-design.md` in this
folder; read that first. This document is the engineering side: what is decided, what is verified,
what the first slice is exactly, and what follows.

## 1. Where we are

- **Design agreed** (30 Sept, revised the same evening): principles; a six-layer world model
  (journal, entities, facts, collections, notes, goals); capabilities as connectors, skills,
  automations and modules; one agent loop with four entry points (turn, sensors, triage →
  deliberation, sleep time); the System One seam; standing things by explicit ask, goal or
  repetition; trust and governance; the workspace; the model route; a new repository.
- **Decisions Q1–Q16** all taken as recommended except Q1: no Apple Developer ID yet; local builds
  are signed with a self-signed certificate so macOS permission grants survive rebuilds.
- **Sessions** are one visible stream plus threads with their own model context, opened
  automatically for any work item; no session picker; memory lives in the world, never in a
  session.
- **Modules stay first-class.** Alpha is a work tool with a companion, not a personal assistant
  with a window. Intelligence stays as a rail item (Skills · Automations · Connections ·
  Knowledge).
- **Layout and look stay as in the current app** (Kenil, 1 Oct): the 224px rail, serif headings,
  the module page with its App · Activity · Settings toggle and subtabs, the table toolbar and
  record drawer, the 380px assistant panel, the blob companion. New content goes inside that
  structure. Clickable prototype: https://claude.ai/artifact/5xNamEYxSyYRoGtnX7bQyQ (version 2);
  its source is `alpha-workspace.html` in the session scratchpad and should be copied into
  `desktop/` when the shell is ported.
- **This repository** was created on 1 Oct with the scaffold only (pyproject, justfile, docs).
  No core code exists yet; the first slice below is the next thing to build.

## 2. Verified facts about the toolchain (1 Oct 2026)

| Fact | Value | How verified |
|---|---|---|
| Python | CPython 3.13.9, uv-managed; uv 0.12.17 | `python3.13 --version`, `uv --version` |
| SQLite | 3.50.4 with FTS5 | `sqlite3` from that Python created an FTS5 table |
| MCP SDK | `mcp` 2.2.0, `fastmcp` 4.0.10 | `uv run --with mcp --with fastmcp` |
| Claude Code CLI | 2.1.278 | `claude --version` |
| Node | the `node@24` Homebrew keg (`/opt/homebrew/opt/node@24/bin`); the machine default Node 25.8.1 is broken (missing `libsimdjson.31.dylib`) and is rejected by Vite 8 / Vitest 5 anyway | `node --version` failed with the dyld error |
| pnpm | 10.34.5 (per the old repo's pins) | old repo memory |
| Tauri | 2.11.6, rustc 1.98.1 | old repo memory |
| Fonts used by the shell | Geist (UI), Source Serif 4 (headings), both on Google Fonts | `apps/desktop/src/styles/app.css` |

**CLI flags that exist in 2.1.278 and matter to us** (from `claude --help` and the old harness
`services/core/alpha/builds/harness_claude_cli.py`, which runs in production today):
`-p/--print`, `--output-format json|stream-json`, `--mcp-config <files…>`, `--strict-mcp-config`,
`--append-system-prompt <text>`, `--system-prompt`, `--allowedTools <tools…>`,
`--disallowedTools`, `--permission-mode`, `--permission-prompts none` (anything that would prompt
is denied), `--setting-sources ""` (ignore user settings, CLAUDE.md and hooks), `--restricted`,
`--no-session-persistence`, `--resume <session-id>`, `--fork-session`, `--max-turns`,
`--max-budget-usd`, `--model <alias|name>`, `--effort`. Headless runs work only from the default
config home (a private `CLAUDE_CONFIG_DIR` is "Not logged in") and only with `USER` in the
environment. MCP tools are named `mcp__<server>__<tool>`; `--allowedTools mcp__<server>` allows
a whole server. The JSON result carries `result`, `session_id`, `is_error`, `num_turns`,
`duration_ms`, `total_cost_usd` (an estimate, not a charge).

**Old-repo quirks that still apply:** `export PATH=/opt/homebrew/opt/node@24/bin:$PATH` before
any pnpm; background computer-use clicks never reach the Tauri WebView (keyboard does), so
driving the app needs full-screen control; wrap long runs in `caffeinate -i`.

## 3. The first slice: world store, MCP server, companion turn

Goal: from a clean checkout, `just ask "log two boiled eggs"` runs a real turn on the
subscription, the model creates a food table because none exists, adds a row, and replies with
what it did and where it is; `just ask "how much have I eaten today"` answers from the table.
No desktop, no connectors, no sensors yet. Everything below is the spec; none of it is written.

### 3.1 Layout

```
core/alpha/
  world/
    store.py        SQLite connection (WAL), schema, ids, time
    journal.py      append, recent, search (FTS5), read, tombstone
    collections.py  create/describe, add/update/delete records, query, aggregate, records FTS
    knowledge.py    notes, goals, facts (bi-temporal, supersession)
    entities.py     kinds, hard-key resolution, merge/unmerge
    modules.py      modules and threads
    world.py        World facade composing the above
  context/prepack.py   the deterministic pre-pack
  runtime/claude_cli.py launch `claude -p` with the MCP server; parse the JSON result
  runtime/turn.py      a turn: journal → pre-pack → run → journal
  mcp/tools.py         plain functions bound to a World (testable)
  mcp/server.py        FastMCP stdio server registering those functions
  cli.py               `alpha ask | journal | search | tables | show | notes | prepack | mcp`
core/tests/
  test_world.py, test_tools.py, test_turn.py (fake runtime)
```

Data directory: `ALPHA_HOME`, default `~/Library/Application Support/Alpha Brain/`; the store is
`world.sqlite` inside it. Tests use a temporary directory.

### 3.2 The store (one SQLite file per person)

Conventions: ids are `<prefix>_<12 hex>`; times are UTC ISO-8601; JSON columns hold JSON text;
nothing is ever deleted physically in the journal (tombstone column), and every derived table
is regenerable from journal rows plus the records.

```sql
-- the verbatim record of everything that happened; source of truth
journal(id PK, at, kind, actor, text, data JSON, module, thread, entity_ids JSON, source, deleted_at)
  kind: said | replied | did | saw | noticed | asked | answered | proposed | made | changed | failed
  actor: person | alpha | source:<connector>
journal_fts: FTS5(text) over journal, tokenize 'porter unicode61', kept by triggers

-- tables Alpha designs; records are the person's data
collections(name PK, module, title, schema JSON, title_field, created_at, updated_at)
  schema: {"fields":[{"name","kind","choices"?,"required"?,"relation"?}]}
  kinds: text | long_text | number | date | datetime | bool | choice | status | url | relation
records(collection, id, revision, values JSON, provenance JSON, created_at, updated_at, deleted_at; PK(collection,id))
  provenance: {"by": "person"|"alpha"|"source:<x>", "journal": <journal id>, "estimated": bool}
  writes are compare-and-swap on revision; zero affected rows is a conflict, never success
records_fts: FTS5(text) where text = the record's string values joined; maintained by code

-- what Alpha writes and maintains; the person can read, edit, delete
notes(id PK, scope, title, body, updated_at)
  scope: person | module:<id> | topic:<slug>
  reserved titles in scope person: "Profile", "Standing instructions", "Permissions"

goals(id PK, text, state, module, since, until, updated_at)   state: active | done | dropped

-- claims with time validity; update-on-write for single-valued predicates
facts(id PK, subject, predicate, value, valid_from, valid_to, recorded_at, superseded_by, source, confidence, state)
  subject: person | entity:<id>;  state: accepted | suggested | rejected
  set_fact(single=True) closes the current accepted fact with the same subject+predicate
  (valid_to = now, superseded_by = new id) instead of keeping both live

-- people, organisations, places, documents, messages, calendar events
entities(id PK, kind, canonical, aliases JSON, keys JSON, merged_into, created_at, updated_at)
  keys: {"email":[...], "linkedin":..., "phone":[...], "path":..., "uid":...}
  resolve(kind, name, keys): a hard-key match returns the existing entity; otherwise create;
  same-name candidates are returned as "maybe", never merged automatically
  merge(a, b): b.merged_into = a; journaled; undo re-opens b

modules(id PK, name, goal, project, created_at, updated_at)
threads(id PK, title, kind, state, module, session_ref, created_at, updated_at)
  kind: build | deepen | research | job | topic;  state: open | working | waiting | done
```

### 3.3 The pre-pack (`context/prepack.py`)

Deterministic, zero model calls, at most ~3,000 tokens. Sections, each line naming its source:

1. WHO — accepted facts with subject `person`, plus the "Profile" note.
2. INSTRUCTIONS — the "Standing instructions" and "Permissions" notes.
3. GOALS — active goals.
4. MODULES — every module with its collections and record counts; collections with no module
   listed under "Loose tables".
5. NOTES INDEX — title and first line of every note (bounded).
6. RECENT — the last 12 stream turns (`said`/`replied`, no thread) verbatim.
7. MATCHES — FTS5 hits for the sentence's terms over journal and records, top 5 each, most
   recent first, with ids.
8. OPEN — open threads; pending asks (`asked` without `answered`).

Scope (a module, a person) moves that module's or entity's material to the top.

### 3.4 The runtime (`runtime/claude_cli.py`)

```
claude -p <sentence>
  --output-format json
  --append-system-prompt <RULES + pre-pack>
  --mcp-config <tmpfile.json> --strict-mcp-config
  --allowedTools mcp__alpha WebSearch WebFetch
  --disallowedTools Bash Edit Write NotebookEdit
  --permission-mode default --permission-prompts none
  --setting-sources ""
  --model $ALPHA_MODEL (default "sonnet")
  --max-turns 20
  [--no-session-persistence]            stream turns are stateless; the pre-pack carries context
  [--resume <session_id>]               a thread resumes its own session
```

MCP config file: `{"mcpServers":{"alpha":{"command": sys.executable, "args": ["-m","alpha.mcp.server"], "env": {"ALPHA_WORLD": <store path>}}}}`.
Environment: inherit, ensure `USER`, never set `CLAUDE_CONFIG_DIR`. Timeout 300 s; on timeout
the process is killed and the turn is journaled as `failed`. The JSON result's `result` is the
reply; `session_id` is stored on the thread when a thread runs.

### 3.5 The turn (`runtime/turn.py`)

`ask(text, module=None, thread=None)`:
1. journal `said` (actor person, module, thread);
2. pre-pack for the scope;
3. run the CLI (stream: stateless; thread: resume its `session_ref`);
4. journal `replied` with `data = {session_id, num_turns, duration_ms, cost_estimate}`;
5. return the reply text.

RULES (the appended system prompt, in this order): who Alpha is and the principles that matter
in a turn (generic; do now, deepen later; never invent; plain words); Level 0: a bare action
with no home creates the simplest durable table with `collection_create` and adds the row with
`records_add`, never a loose note; before answering about the past, `search`; facts about the
person go through `fact_record` as `suggested` unless the person stated them; anything that
would leave the machine is not available in this slice, say so; when the ask is a standing thing
(an explicit "track/keep/watch/every", or a goal), open a thread with `thread_open` and tell the
person it is being set up (the deepen pass arrives in slice 3); reply with what was done and
where it is, in two or three sentences.

### 3.6 MCP tools (`mcp/tools.py`, registered in `mcp/server.py`)

All take and return JSON-serialisable values; errors are returned as `{"error": ...}` in plain
words, never raised through the server.

- `search(query, kinds=None, limit=10)` → journal and record hits: id, when, kind/collection,
  snippet.
- `journal_recent(limit=20, module=None, thread=None)`, `journal_read(id)`,
  `journal_note(kind, text, data=None, module=None)` — Alpha records what it did.
- `collections_list()`, `collection_describe(name)`,
  `collection_create(name, title, fields, module=None, title_field=None)`,
  `records_add(collection, values, estimated=False)`,
  `records_update(collection, id, values, revision)`, `records_delete(collection, id, revision)`,
  `records_query(collection, where=None, order=None, limit=50)`,
  `records_aggregate(collection, op, field=None, where=None)` (count | sum | avg | min | max).
- `notes_list(scope=None)`, `note_read(id)`, `note_write(scope, title, body)`.
- `goals_list(state="active")`, `goal_set(text, module=None)`, `goal_update(id, state)`.
- `facts_get(subject="person")`, `fact_record(subject, predicate, value, state="suggested", why=None)`.
- `entities_find(name=None, email=None, url=None, kind=None)`, `entity_resolve(kind, name, keys=None)`,
  `entity_read(id)`.
- `modules_list()`, `module_create(name, goal=None)`.
- `threads_list(state=None)`, `thread_open(title, kind, module=None)`, `thread_update(id, state=None, note=None)`.
- `ask_person(question, options=None)` → journals `asked`; `propose(text, why)` → journals `proposed`.

Server: `FastMCP("alpha")`; tools registered with `mcp.tool(fn)` so the functions stay plain and
testable; the World path from `ALPHA_WORLD`; stdio transport.

### 3.7 CLI (`cli.py`, script `alpha`)

`alpha ask "<text>" [--module NAME] [--thread ID]`, `alpha journal [--limit N] [--module NAME]`,
`alpha search "<q>"`, `alpha tables`, `alpha show <collection> [--limit N]`, `alpha notes`,
`alpha prepack "<text>"` (prints the pre-pack), `alpha mcp` (runs the server; used by the CLI
config). `ALPHA_HOME` overrides the data directory; `ALPHA_MODEL` the model alias.

### 3.8 Tests and the acceptance check

- `test_world.py`: journal append/search/tombstone; collection create with every field kind,
  add/update with compare-and-swap, query with where/order, aggregate; records FTS; notes; goals;
  facts supersession (single-valued) and side-by-side (multi-valued); entity resolution on email,
  same-name "maybe", merge and undo; modules; threads.
- `test_tools.py`: every tool through its plain function against a temporary World; error
  shapes.
- `test_turn.py`: a fake runtime (a callable) that asserts the pre-pack contains the recent turn
  and the matches, and that both journal rows are written.
- **Acceptance is a real run**, never a surrogate (the rule from 30 Sept): `just ask "log two
  boiled eggs"` on the subscription, then `just ask "how much have I eaten today"`, with the
  actual replies and `alpha show food` pasted into the commit message or the direction log.

## 4. What follows (from the design's order of work)

2. Browser, files and calendar connectors as skill directories with `connector.yaml`
   (`design/research/connectors-and-sources.md` §5); the derived pages and the workspace ported
   from the current shell into `desktop/`; the companion (avatar window) ported.
3. Sensors, triage (rules first, System One seam second), the sleep-time pass, the digest, the
   Inbox lanes on Home; explicit asks deepen at once in a thread.
4. The entity registry and bi-temporal facts across sources (built minimal in slice 1, filled by
   connectors here).
5. The standing-things ladder with promotion from verified runs; skills and automations as
   objects; Intelligence tabs.
6. Pending actions and Access; per-kind standing permissions as sentences.
Then email (Mail.app locally; Anthropic's Gmail connector on the subscription), contacts, the
Chrome 144 bridge and the API route.

## 5. What to port from `../alpha-platform`, and only when the slice calls for it

| Piece | Path in the old repo | Used in |
|---|---|---|
| Browser session driver (sign-in profile, headless reads) | `workers/validator/src/browser_session.mjs` | slice 2 |
| Voice toggle | `apps/desktop/src/shell/voice.tsx` | slice 2 |
| Avatar window and character | `apps/desktop/src/avatar/*` | slice 2 |
| Derived pages (table/board/list/calendar/chart, record drawer) | `apps/desktop/src/modules/DataPage.tsx` | slice 2, re-fitted to one store |
| Shell chrome, tokens, styles | `apps/desktop/src/shell/Rail.tsx`, `styles/app.css`, `styles/tokens.css` | slice 2 |
| Tauri host | `apps/desktop/src-tauri/` | slice 2 |
| Record store ideas (CAS writes, provenance, schema-change rules) | `services/core/alpha/data/store.py` | slice 1 (ideas only) |
| Verbatim turns + FTS5 | `services/core/alpha/assistant/sessions.py` | slice 1 (ideas only) |
| Profile facts | `services/core/alpha/context/profile.py` | slice 1 (ideas only) |
| Scheduler | `services/core/alpha/execution/scheduler.py` | slice 3 |
| CLI harness flags and process handling | `services/core/alpha/builds/harness_claude_cli.py` | slice 1 (flags only) |
| Structured model calls | `services/core/alpha/models/structured.py`, `gateway.py` | slice 3 (System One seam) |

Never ported: the app contract, the build pipeline, planner, verifier, workers, per-module
stores, the module-centred assistant.

## 6. Open engineering questions (to settle while building slice 1)

- Stream turns stateless with the pre-pack (simple, cache-unfriendly) versus resuming one
  session per day (cheaper, risks context bleed). Start stateless; measure.
- Where standing instructions live: a reserved note (chosen for slice 1) versus facts with a
  reserved predicate. Revisit when permissions become sentences with provenance.
- `records_fts` maintenance in code versus triggers over JSON: code, because the text is derived
  from typed values.
- The reply's citations ("Food · Entries") come from the model in slice 1; later the turn
  records which tools ran and the shell draws the citation from that.
