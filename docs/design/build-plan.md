# Build plan

1 October 2026; brought up to date 2 October 2026, evening (§1, §4.3, §4.5, §4.9), then corrected the same evening after the code was read in full against the docs (§4.10 and the italic notes in §3 and §4). Written so that any session
(or person) can continue from here without the conversation that produced it. The design it implements is `alpha-second-brain-design.md` in this
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
- **Sessions** are one visible stream plus threads opened automatically for any work item; no
  session picker; memory lives in the world, never in a session. *(Revised 2 Oct, Q21: threads
  are records with a brief, never a remembered model session; nothing is resumed.)*
- **Building happens in the one conversation** (Kenil, 1 Oct): an explicit "I want to build…" is
  researched, decided and built in the same conversation, even when it takes minutes; the
  separate deepen threads were removed. Threads remain for automations and builds (each has
  its own).
- **Modules stay first-class.** Alpha is a work tool with a companion, not a personal assistant
  with a window. Intelligence stays as a rail item (Skills · Automations · Connections ·
  Knowledge).
- **Layout and look stay as in the current app** (Kenil, 1 Oct): the 224px rail, serif headings,
  the module page with its App · Activity · Settings toggle and subtabs, the table toolbar and
  record drawer, the 380px assistant panel, the blob companion. New content goes inside that
  structure. Clickable prototype: https://claude.ai/artifact/5xNamEYxSyYRoGtnX7bQyQ (version 2);
  its source is `alpha-workspace.html` in the session scratchpad and should be copied into
  `desktop/` when the shell is ported.
- **This repository** was created on 1 Oct. **Slice 1 is built** (1 Oct, see §3.9 for what ran):
  world store, pre-pack, the `claude -p` runtime, the MCP server with 31 tools, the turn, the
  CLI; 25 tests, ruff and mypy strict clean. **Slice 2 is built** (1 Oct, §4.1): the files,
  browser and calendar connectors, the core's HTTP API, and the desktop app (workspace and
  companion) hosting the core. **After slice 2** (1 Oct, §4.2): one-conversation building,
  automations, the capability model (platform hands vs Alpha's know-how) with readers Alpha writes
  and repairs, complete removal that keeps the audit, paginated tables, Settings with the Claude
  connection. **2 Oct** (§4.6–§4.8, 18 commits): memory and data foundations (row history, rows
  that are people, threads as records, what the model saw); plan first, sources, pipelines and
  background builds with no limits; known, assumed or asked (provenance on every value, a second
  opinion on every answer Alpha worked out, a trial on every build). 45 commits since 1 Oct; 136
  core + 3 desktop tests; 70 tools; ruff and mypy strict clean (2 Oct late evening). **Later the
  same evening:** the journey suite (§4.11), the trust holes closed (§4.12), the write route
  (§4.13, Q24), builds watched live on Home (§4.14).
  **Where we stand and what is open: §4.3, §4.5 and §4.9; what the code read of 2 Oct evening
  found: §4.10.** Slice 3 (proactivity) and the sleep-time pass have not started.

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
| Claude Code sign-in | `claude auth status` prints JSON (`loggedIn`, `authMethod` "claude.ai", `email`, `subscriptionType`) and exits 0 signed in, 1 not; `claude auth login [--claudeai\|--console]`; `claude auth logout`; installer `curl -fsSL https://claude.ai/install.sh \| bash` (per user, `~/.local/bin/claude`, no admin) | run here 1 Oct; code.claude.com docs |
| Subscription in a product | Agent SDK docs: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." Fine for Kenil's own use; anyone else needs approval or API keys | code.claude.com/docs/en/agent-sdk/getting-started.md, 1 Oct |
| Playwright / browser | `playwright-core` 1.62.0 driving the installed Google Chrome (`channel: "chrome"`), per-sign-in persistent profiles | `connectors/browser` |

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
No desktop, no connectors, no sensors yet. Everything below is the spec as written on 1 Oct; it is kept as the record of slice 1. *Where the code has since moved on, an italic note says so; the full list of differences is §4.10.*

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

*As of 2 Oct the schema has grown past this (every difference in §4.10): journal kind `checked`;
actors are only `person` and `alpha`, a connector names itself in `source` as `connector:<name>`;
field kinds add `multichoice` and specs carry `label`, `unit`, `done_choices`, and the schema an
`identity` (`rows_are`, `identity_field`); provenance keys are `by`, `turn`, `source`,
`estimated`, `assumed` (never `journal`); note scope is `module:<name>`, not the id; entity keys
add `url` and `domain` and live in an `entity_keys` table; `facts` has a `why` column; thread
kind `deepen` never existed in code and `session_ref` is never set; added tables: `meta`,
`record_versions`, `turn_contexts`, `connections`, `documents` (+FTS), `events`, `automations`,
`readers`, `plans`, `sources`; added record columns `entity_id`, `reader`, `seen_at`, `gone_at`.*

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

*As built it differs: twelve sections (NOW · WHO THE PERSON IS · THEIR INSTRUCTIONS · ACTIVE
GOALS · WHAT ALPHA HOLDS · WHAT ALPHA CAN REACH · TODAY'S CALENDAR · NOTES · RECENT CONVERSATION
· MATCHES FOR THIS SENTENCE · THIS THREAD · OPEN), cut at 12,000 characters; WHO includes
suggested facts marked by state; notes are the first 100 characters, at most 20; matches are
relevance-first (5 records, 3 documents, journal hits to 10 lines in all); only a module scope
exists and it moves that module first within WHAT ALPHA HOLDS; no entity cards.*

### 3.4 The runtime (`runtime/claude_cli.py`)

```
claude -p <sentence>
  --output-format json
  --append-system-prompt <RULES + pre-pack>
  --mcp-config <tmpfile.json> --strict-mcp-config
  --allowedTools mcp__alpha WebSearch WebFetch
  --disallowedTools Bash Edit Write NotebookEdit      (now also Read Glob Grep Task)
  --permission-mode dontAsk --permission-prompts none   ("default" is not a mode in 2.1.278;
                                                          dontAsk refuses anything not allowed)
  --setting-sources ""
  --model $ALPHA_MODEL (default "sonnet")
  --max-turns 20                        (removed 2 Oct: no step cap, §4.7)
  [--no-session-persistence]            stream turns are stateless; the pre-pack carries context
  [--resume <session_id>]               (removed 2 Oct, Q21: nothing is ever resumed)
```

MCP config file: `{"mcpServers":{"alpha":{"command": sys.executable, "args": ["-m","alpha.mcp.server"], "env": {"ALPHA_WORLD": <store path>}}}}`
*(now also `ALPHA_TURN`, `ALPHA_THREAD`, `ALPHA_MODULE`, so the tools know which turn they serve)*.
Environment: inherit, ensure `USER`, never set `CLAUDE_CONFIG_DIR`. Timeout 300 s *(removed 2 Oct:
no time limit; the person stops, and the stop kills the whole process group)*. The JSON result's
`result` is the reply; `session_id` is journaled in the reply's data and used for nothing. *Two
more run kinds share the launcher since 2 Oct (§4.8): `independent` (WebSearch and WebFetch only,
no MCP) and `judge` (no tools at all).*

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

*Superseded 2 Oct. Today's RULES are ten numbered rules in `runtime/turn.py`: known, assumed or
asked (1–2); tables never loose, `table_start` for a log with no home (3); answer from the data,
the journal is history (4); stated facts kept, inferred ones suggested, instructions only in the
person's words (5); never build on a request, understand → research → look at the sources →
propose with a trial (6–7); reading is free, sign-ins and bot checks said plainly (8); nothing
leaves the machine (9); plain replies naming where each number came from (10). Nothing in them
opens a thread; "do now, deepen later" is gone (§4.7–§4.8). The build, automation, repair,
independent and judge runs each have their own rules in `build.py`, `automation.py`,
`pipeline.py` and `check.py`.*

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

*Thirty-one tools then; 63 on 2 Oct, registered from the `@tool` methods of `Tools` in
`mcp/tools.py`. Finding: `search` (records, documents, journal; no `kinds`), `journal_recent`,
`journal_read`, `journal_note`. Tables: `collections_list`, `collection_describe`,
`collection_create` (gated; `rows_are`, `identity_field`), `collection_identify`,
`collection_add_fields`, `record_history`, `records_add` (`source`, `assumed`),
`records_upsert`, `records_update` (`source`, `assumed`), `records_delete`, `records_query`,
`records_aggregate`, `table_start`, `page_to_table`. Knowledge: `notes_list`, `note_read`,
`note_write`, `instruction_add`, `instruction_remove`, `instruction_propose`, `thread_brief`,
`goals_list`, `goal_set`, `goal_update`, `facts_get`, `fact_record` (`stated`). Entities:
`entities_find`, `entity_resolve`, `entity_read`. Modules and threads: `modules_list`,
`module_create` (gated), `threads_list`, `thread_open`, `thread_update`. Hands:
`connections_list`, `folder_watch`, `files_sync`, `documents_list`, `document_read`,
`page_read`, `page_script`, `reader_save` (gated for a new name), `reader_run`, `readers_list`,
`browser_signin`, `calendar_connect`, `calendar_sync`, `calendar_events`. Automations:
`automation_create` (gated), `automations_list`, `automation_update`. Plans and sources:
`plan_propose`, `plan_approve`, `plan_resume`, `plan_decline`, `source_add` (gated),
`sources_list`. Person: `ask_person`, `propose`.*

### 3.7 CLI (`cli.py`, script `alpha`)

`alpha ask "…" [--module] [--thread]`, `journal`, `search`, `tables`, `show`, `notes`, `prepack`,
`mcp` (slice 1); since then `context <turn>` (what the model saw), `check [turn] [--no-repair]`,
`remove-module`, `clear-conversation`, `connect folder|site|calendar`, `serve [--port]`. The
default world is `~/Library/Application Support/Alpha Brain/` unless `ALPHA_HOME` is set (the
app sets it to its own `com.alpha.brain` folder). `alpha ask` runs one turn only; the second
opinion and the build kick live in `alpha serve`.

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

### 3.9 What ran (1 Oct 2026, 00:33–00:34 local, Sonnet on the subscription, scratch world)

| Said | Steps · time | What Alpha did | Reply (verbatim, trimmed) |
|---|---|---|---|
| log two boiled eggs | 5 · 13.8 s | made the module Food and the table Food Log (date, item, quantity, unit, calories, protein_g, carbs_g, fat_g, notes); added the row, estimated | "Logged 2 boiled eggs (~156 kcal, 12g protein, 11g fat, 1g carb — estimated) in the new Food module's Food Log table." |
| had a flat white and a chicken salad for lunch | 5 · 9.6 s | added two rows to the existing table, estimated | "Logged lunch: flat white (~130 kcal) and chicken salad (~400 kcal) … today's total so far to ~686 kcal across 4 items." |
| how much have I eaten today, and how much protein | 4 · 11.4 s | aggregated the table | "Today you've had ~686 kcal and ~53g protein across 3 entries …" |
| I want to properly track my calories and nutrition. I'm 178 cm and 78 kg, and I want to stay under 2000 kcal on weekdays. | 7 · 18.7 s | accepted facts height_cm 178, weight_kg 78; goal "Stay under 2000 kcal on weekdays"; opened a deepen thread; reused the table | "Saved your height … set an active goal … opened a thread to flesh out the tracking further … Everything lives in the Food module." |

Every change is in the journal with its turn (`alpha journal`). Found: the second reply said
"4 items" for 3 rows (it counted the two eggs); the deepen thread opens but nothing runs it yet
(slice 3); the per-turn cost estimate the CLI reports is about $0.02–0.05 on Sonnet.

## 4. What follows (from the design's order of work)

### 4.1 Slice 2 as built (1 Oct 2026)

- **Connectors** (`connectors/<name>/connector.yaml` + `SKILL.md`, Python in
  `core/alpha/connectors/`): *files* (watched folders → documents, PDF/Word/Excel/PowerPoint/
  text, document entities keyed by path, live through watchdog); *browser* (the old read-only
  Playwright driver, on the installed Chrome, per-site profiles the person signs into,
  non-blocking sign-in; extended the same day with scripts, bot-check and sign-in detection, §4.2); *calendar* (EventKit, 30 days back / 60 ahead, attendees resolve to
  people by email). A connection is a row (`connections`), shown in Intelligence.
- **Core API** (`alpha serve`, `core/alpha/api/server.py`): loopback, bearer token from the host;
  Home, modules, tables (person edits journaled as theirs), people + timeline, Intelligence,
  Activity, search, conversation, background turns, threads, connections. Prints
  `ALPHA_CORE_READY {"port": …}` for the host.
- **Desktop** (`desktop/`, Tauri 2.11.6 + React 19, the old shell's look): the host launches
  `<repo>/.venv/bin/python -m alpha.cli serve --port 0` with HOME/USER/PATH for the Claude CLI,
  `ALPHA_HOME` = `~/Library/Application Support/com.alpha.brain`, `ALPHA_TOKEN`; companion window
  (always on top, all Spaces) and tray; Info.plist carries the calendar, microphone and speech
  usage strings. Pages: Home (needs you, threads, coming up, modules), module (App · Activity ·
  Settings, Summary + a derived page per table), People & Person, Intelligence (Skills,
  Automations, Connections with connect forms, Knowledge), Activity; the conversation panel
  with thread cards and their own view; the companion with presence, bubble and panel. *(The
  People and Person pages were removed the same day, §4.2.)*
- **Verified**: 43 core tests + 3 desktop tests; in the browser pane against the scratch world
  (every page renders, an inline edit saved and journaled as the person's, a turn from the
  panel answered "~53 g protein today" in 6 s); in the native app on the real world (core ready
  in under a second after the first launch, a turn typed in the app's own panel answered).
  Real connector runs: a watched folder summarised (10.6 s); We Work Remotely read into Job
  Search › Openings with fit scores (91 s, 18 steps).
- **Signing** (1 Oct, Q1): local builds are signed with a self-signed certificate "Alpha Local
  Signing" in the login keychain (SHA-1 1AD9A7DC…5FDB31, valid to 2036; untrusted, which is fine
  for signing). The designated requirement is `identifier "com.alpha.brain" and certificate root
  = H"1ad9a7dc…"`, so macOS keeps Alpha's permissions across rebuilds: verified by rebuilding with
  a code change (new CDHash) and relaunching, core ready in 1 s, no prompt. `tauri.conf.json`
  names the identity; builds put `/usr/bin` first on PATH because a python.org `xattr` without
  `-r` shadows the system one and breaks Tauri's signing step. On another Mac, make the same
  certificate (openssl, codeSigning EKU, `security import … -T /usr/bin/codesign`).
- **Found**: (1) the first launch from a repository on the Desktop waits on macOS's
  Desktop-folder prompt (about four minutes here) and left the workspace window blank until a
  relaunch; the cure is the bundled runtime (core outside the Desktop folder) or moving the
  repository, plus showing "waiting for macOS" in the window. (2) Turns don't yet link companies
  and people as entities when they read pages (People stayed empty after the job search). (3) The
  `Cargo.lock` must be kept: without it cargo resolves companion crates that don't build with
  tauri 2.11.6. (4) The calendar's real first read is still to run; it is the person's own
  macOS prompt, from Intelligence › Connections › Connect calendars in the app.


### 4.2 After slice 2: what was built (1 Oct 2026, 10:13–23:44, 20 commits)

Most of it came from using the app on the two judging journeys and from Kenil's reviews.

- **One conversation, building in it** (`d4fa35d`, `98dd953`). An explicit "I want to build…"
  is researched and built in the same conversation; Alpha's questions are closed by the person's
  next message. The deepen side threads were removed.
- **Automations** (`98dd953`): `automation_create/list/update` tools; schedules "every Nh/Nm",
  "daily HH:MM", "weekly mon HH:MM"; a scheduler in the core (`runtime/automation.py`, checks
  every 30 s, claims a run before starting it); each automation has its own thread and runs with
  AUTOMATION_RULES; "worth telling" lines become `noticed` entries. Intelligence › Automations and
  module Settings show a sentence, a switch and Run now with live steps; a run's note is shown
  only when it failed (`9f561bf`).
- **The capability model** (design §4.0, `1eee620`): the platform builds a few universal *hands*
  and the guardrails, which Alpha can't change; Alpha writes, tests and repairs the *know-how*
  (site readers, app connectors); effects are classed read / write inside Alpha / write outward
  (asks first) / never (passwords, money, permanent deletion), enforced in the process boundary;
  a gap is a hand (system owner for now), access (the person) or know-how (Alpha).
- **Browser hand** (`1c9e60c`, `1f7fccb`, `f5993a0`, `bf2a5e8`, `afa8f11`): `page_script` runs
  Alpha's own JavaScript in a page; reading to the end scrolls until four rounds bring no new
  links; non-GET requests are blocked *only while Alpha's script runs* (LinkedIn pages its list
  with a read-only POST, so blocking by method during loading cut the list to 10). A sign-in
  covers every site its window passed through (gmail.com → google.com), recorded in
  `alpha-signin.json` next to its profile; when a page asks for a sign-in no sign-in covers,
  Alpha first tries the sign-ins it holds and records the one that works.
- **Readers** (`1f7fccb`, `4582db8`, `world/readers.py`): `reader_save`/`reader_run`; a reader is
  health-checked before it writes (no rows; under 0.5× the last good run; under 0.75× the rows
  the table holds; required fields missing on over 20%) and a broken one is repaired by Alpha in
  the automation's run. `page_to_table` is refused inside automations. Connector `SKILL.md`
  bodies now reach the model (`skills_text()`).
- **Workspace from Kenil's review** (`1eee620`, `8aeb7ea`): People & Companies removed (generic
  only), connections only in Intelligence, module Activity shows everything 50 at a time, the
  schedule lives in module Settings, no About-you page, no sample rows in Summary, the "Ask
  Alpha" tab on the right edge.
- **Tables** (`2ac0cf0`, `48c7c90`): the page loads every row (the model still reads 500 at a
  time) and pages them itself; rows per page default to what fits the window, a fixed size can
  be chosen; rows scroll inside the table with the header and totals held; totals and the
  module summary count every row.
- **Companion** (`48c7c90`): the page reports where it is drawn and the host lets clicks
  through everywhere else (its transparent corners covered the workspace's pager).
- **Removal and the audit** (`98ee832`, `bf2a5e8`, `485657d`, `8823e34`; `world/purge.py`):
  `remove_module` and `remove_connection` delete the thing and what exists because of it
  (tables and rows, readers, automations, notes, goals; a sign-in's browser profile on disk,
  documents, events) but **never the journal**: each removal is journaled ("Removed X: …" with
  `data.removed`), threads keep their record but lose the resumable session, open questions
  close, and `Journal.mark_removed` marks history about removed things wherever Alpha reads it
  (search, journal tools, pre-pack), with a rule that the journal is history.
  `clear_conversation` deletes said/replied by design. Connection removal confirms in its own
  row in the same words Activity records.
- **Questions** (`9e444b5`): every Needs-you question can be dismissed; sign-in requests close
  themselves when signed in or asked again.
- **Settings** (`08ad89b`): Claude (status, Install, Sign in through Claude Code's browser
  login, Sign out), companion and appearance (the theme left the rail), your data (folder, Show
  in Finder, Back up now via SQLite's backup), defaults (rows per page); "Connect Claude to
  start" on every page while Claude Code is missing or signed out.
- **Runtime values then**: `--max-turns 80`, timeout 900 s, Sonnet; stream turns stateless,
  automation threads resumed their own session. *(All three superseded on 2 Oct: no step cap, no
  time limit, §4.7; nothing resumed, §4.6.)*

### 4.3 Where we stand (recon, 2 Oct 2026)

Against the design's order of work:

| Step | State (end of 2 Oct) |
|---|---|
| 1. World store, MCP server, stream, companion | Done. Plus: row history, what the model saw per turn, threads as records (§4.6) |
| 2. Browser, files, calendar; derived pages | Done, plus §4.2. Readers mark rows seen and gone; paged lists are read whole or say so. Calendar's real first read still not run |
| 3. Sensors, triage, sleep-time pass, digest, Inbox | Not started |
| 4. Entities and bi-temporal facts across sources | Partial: rows that are people link by hard key (1,548 connections are now people, §4.6); no cross-source linking yet, no sleep-time pass; same-name maybes shown nowhere; merge only by an API route the app never calls, unmerge unreachable (§4.10) |
| 5. Standing-things ladder, promotion from verified runs | Partial: automations and pipelines exist; every standing thing goes through a plan and a yes (§4.7); no ladder, no promotion from repetition |
| 6. Pending actions and Access | Built as actions (§4.13, Q24): a dry-run card, the person's yes, prepare-level standing sentences; the first real draft was made in Kenil's Gmail. No Access page; sends have no sentences yet |
| — Trust (design §7, added 2 Oct) | Built: plan-first by mechanism; sources with a status; known, assumed or asked; the second opinion; build trials (§4.8). Holes: the opinion never fires for upserted or reader-written rows; an omitted `source` defaults to estimated (§4.10) |
| — Hands free of site vocabulary (Q17) | Done 2 Oct evening (Q23): generic wall and paging detection, one `url` key with a migration, no Sites section (§4.10) |
| — No limits (Q18) | Holds for turns and builds; one floor by decision, 30 minutes between an automation's runs (Q22); the hands' own timeouts (§4.10) |

Proven on real runs (the person's own world, the subscription): LinkedIn connections read in
the person's session (1,548 rows, daily at 07:00, Alpha's own reader); Gmail read through the
browser (tracking and shipment details from the last 100 emails; then emails from LinkedIn
connections in the last 24 hours and what one of them said, the first answer joining two
sources); Nutrition (tables plus a weekly review automation); the ETA deal tracker built after
a plan and a yes (Deal Tracker, 365 rows from the readable broker sites, daily; its first build
hit the old 80-step cap, which is why there are no limits now); the second opinion on the shake
(160 → 215 kcal from the Morrisons page in 58 s, flavour asked). Proven only by tests: the
calendar connect, Install and Sign in from Settings on a fresh Mac, the
try-the-sign-ins-you-hold path, a build's trial being sent back.

### 4.4 What the recon flagged

1. **Decided 2 Oct: Gmail through the browser is fine** (Kenil; Q4 revised in the design). It
   was flagged because it went against decision Q4 ("keep Gmail out of scope until a Google app is justified;
   use Anthropic's Gmail connector meanwhile"). It is now read by driving a signed-in browser:
   it works, it is the access path Google likes least, and it is the most sensitive source
   Alpha reads. Needs a deliberate decision.
2. **LinkedIn reads the whole list daily.** Q3 said "at human pace". A full scroll of 1,548
   connections every morning is closer to what LinkedIn acts against; reading only what is new
   would be gentler.
3. **The make-or-break hasn't moved since slice 1.** Memory and context: beliefs going stale in
   resumed threads (Alpha "concluded" LinkedIn caps the list and carried it), no sense of time
   ("yesterday"), no sleep-time pass, people not linked across sources. The Gmail × LinkedIn
   answer came from the model's cleverness in the moment, not from Alpha knowing the person.
4. **Proactivity is close to zero**: apart from automations' notes Alpha never brings anything
   to the person; no digest, no notifications.
5. **The last stretch was reactive polish** (about 10 of 25 commits fixed what Kenil found
   while using the app). Valuable, but away from the thesis.
6. **Not shippable to anyone else**: the app runs Python from this repository's `.venv`;
   self-signed; the subscription login needs Anthropic's approval for other users; first run on
   a fresh Mac untested; a repository on the Desktop makes the first launch wait on macOS.
7. **Loose ends**: desktop-control and app-scripting hands not built; how hand gaps are
   collected across many users (Adobe) is open; `page_to_table` still carries site knowledge in
   the platform (reduce it to a first look); the photo-vs-name half of the LinkedIn driver fix
   sits in `git stash` as know-how Alpha should learn; whether the Python Agent SDK (which
   bundles Claude Code) supports every flag in §3.4 is unverified, so the runtime stays on the
   CLI.

### 4.5 What next (proposed 2 Oct; where each stands at the end of the day)

- **A. Sessions and memory**: foundations built (§4.6, design §3.5–§3.6). Still open: the
  sleep-time pass (idempotent derivations, hard-key links across sources, soft matches
  proposed) and the scenario suite.
- **B. Slice 3, proactivity**: not started. Triage of new data, the digest, the Inbox on Home.
- **C. The Gmail decision**: done, Gmail stays in the browser.
- **D. A working rule**: half there. The second opinion and the build trial (§4.8) are the
  mechanism; the three or four standing journeys every change is judged against are not yet
  written down as a suite that runs.
- **E. (new, 2 Oct) Plan first and trust**: done (§4.7, §4.8). What it leaves open is in §4.9.

Recommended order now: finish D as a runnable suite of real journeys (it is what stops the
next "Again!"), then A's sleep-time pass, then B.

### 4.6 Memory and data foundations (built 2 Oct 2026)

Decided with Kenil after his research on memory systems; the design is §3.5–§3.6.

- **Row history** (`250b7b4`): `record_versions` keeps a record's previous values on every
  update, upsert change and delete; `record_history(collection, id)`.
- **Rows that are people** (`250b7b4`): `collection_create(rows_are, identity_field)` and
  `collection_identify`; each write resolves the row's entity by its email or URL (zero model
  calls) into `records.entity_id`; `entity_read` lists every row that is the entity.
- **World identity and migrations** (`250b7b4`): `meta.world_id`; older files gain new columns
  on open (`ADDED_COLUMNS` in `world/store.py`).
- **Threads are records** (`2e41653`): `--no-session-persistence` on every run, never
  `--resume`; `threads.brief` written with `thread_brief`; the pre-pack's THIS THREAD section
  carries the brief and the thread's last 15 entries; AUTOMATION_RULES tell a run to keep the
  brief.
- **What the model saw** (`2e41653`): `turn_contexts` (pre-pack text plus a hash of the rules)
  per turn; `alpha context <turn>`; clearing the conversation drops its contexts.
- **Dates** (`2e41653`): conversation, matches and thread history lines read "Thu 1 Oct 21:21"
  in local time.
- **Instructions** (`2e41653`): `note_write` refuses "Standing instructions" and
  "Permissions"; `instruction_add/remove(sentence, quote)` require the person's own words from
  the turn's message; `instruction_propose` waits for a yes, which adds it with no further
  turn. Notes record their source turn.
- **Real runs** (2 Oct, on a copy of Kenil's world, Sonnet on the subscription): "Every row in
  my LinkedIn connections is a person…" → Alpha called `collection_identify`, 1,548 rows
  linked to 1,548 people by profile URL in 16.9 s; "From now on, always round calories to the
  nearest 10…" → `instruction_add` with the quote, the note's source is that message (8.8 s).
  The kept context showed dated conversation lines. Alpha's first reply overstated ("like it
  already did with Alexander Miller": that earlier answer matched by name, not by key).
- **Next:** the sleep-time pass (idempotent, versioned derivations; hard-key links across
  sources, soft matches proposed) and the scenario suite (our journeys plus a correction, a late
  arrival, a future-dated change and a private fact), then slice 3.

### 4.7 Plan first, sources, pipelines, background builds (decided 2 Oct 2026)

Why: "i want a live daily tracker capturing all deals from my eta tracker list" (2 Oct) — Alpha
read the person's CSV of 20 broker sites, built a module, 9 tables and 8 readers on its own
guesses, set aside 54 rows over "PENDING" vs "Pending", was told four healthy readers were
broken (the health check compared one reader's rows with the whole table's), copied rows
between tables through the model, and was cut off at 900 s with no automation, no note and no
reply. Rule 5 told it to build first and ask at the end. Kenil's expectations and decisions are
in the design §6 (revision of 2 Oct). The build:

- **Store**: `plans` (id, title, body, state proposed → approved → building → done | stopped |
  declined | replaced, module, thread, turn, approval, attempts, report); `sources` (module,
  title, url, reader, status working | needs_signin | blocked | broken | not_built, detail,
  last_checked, last_rows); `records.reader/seen_at/gone_at`; `automations.steps`.
- **Gate**: `module_create`, `collection_create`, a new `reader_save`, `automation_create` and
  `source_add` refuse unless the turn is a build of an approved plan. `table_start` makes the
  one simplest table for a log with no home, with its first row. `plan_propose` journals the
  plan as a proposal; `plan_approve(plan, quote, answers)` needs the person's words from a
  message after the plan; the app approves with a button (`/api/plans/{id}/approve`).
- **Builds** (`runtime/build.py`): the scheduler starts approved plans in their own thread
  (kicked right after every turn); BUILD_RULES; a run cut off continues from
  the brief *(then: by the time limit, at most four runs; since the same afternoon no time limit
  and no cap, see "No limits" below)*; the report goes into the conversation with a coverage line from
  the sources table.
- **Readers and pipelines** (`runtime/pipeline.py`): one `run_reader` for tools and pipelines;
  health compares with the rows *this* reader returned last time; every healthy run marks rows
  seen and the reader's missing rows gone; choices match regardless of case; steps
  `{"read": reader, "into": table, "key": field, "keep": [...], "map": {field: {from: to}}}`
  and `{"tell": table, "where": {...}}`; a broken step gets one repair turn by the model, then
  one rerun; a sign-in wall asks the person once; a bot check marks the source blocked.
- **Browser**: bot-check pages (challenge titles and markers, captcha frames) come back as
  `bot_check`; reads mark that site's sources needs_signin or blocked.
- **App**: plan proposals in Needs you (Approve / Not now); a module's sources with their status
  in its Settings; build progress on the thread card.

**As built (2 Oct, `f9194aa` … `d734aab`)**, plus what the real runs added: the browser treats
a captcha widget on a form as an ordinary page (only a challenge title, a challenge page's own
marks or a page that is only a captcha is a bot check) and a visible password field as a sign-in;
`reader_save` refuses a reader on a page that shows more pages until Alpha says `whole` (every
page) or not (newest page only, whose rows are never marked gone); sources also have
`unavailable` (nothing to read) and `skipped` (the person's choice); tables fed by readers show a
Seen column (New today, Since, Gone) and hide gone rows; removing a module removes every reader
that fed it. 98 core tests, ruff, mypy strict.

**Real runs** (2 Oct, on copies of Kenil's world with the blind module removed, Sonnet on the
subscription):

1. "i want a live daily tracker capturing all deals from my eta tracker list" → nothing built;
   in 137 s Alpha opened all 20 sites (reading only) and proposed one Listings table, readers that
   page fully and a daily tell, with four questions. Three sites were wrongly called blocked (the
   captcha-widget bug above, then fixed). Rerun after the fix: 162 s, classification right (APS
   and Kumo need a sign-in, Sunbelt a bot check), and it asked whether general brokers' listings
   should be all or only accounting firms.
2. Stand-in answers (mine, not Kenil's: all listings with an accounting mark; skip BizBuySell,
   APS, Kumo, Transworld, Sunbelt, Metro; tell at 7) → `plan_approve` with the quote, 12 s.
3. The build, run as the scheduler would: one run, 737 s. Module ETA Deals, one Deals table (309
   rows from 13 sites, 53 marked accounting), 13 readers, a pipeline of 13 read steps and a tell
   step at 07:00 (no procedure), all 20 sources with a status and a reason, the module note, and
   a report in the conversation ending "Sources: 20 in all — 13 working, 2 need your sign-in, 3
   blocked, 2 not read yet." Found: several readers read only the first page and the report
   admitted it for three other sites only (fixed by the more-pages check); a newest-page reader
   would have marked rows gone daily (fixed by `whole`); dead links were filed as blocked (fixed
   by `unavailable` and `skipped`). The more-pages check finds 4 of the 5 paged sites (not Quiet
   Light).

Then the blind ETA Tracker module was removed from Kenil's world (backup first; 9 tables, 756
rows and 8 readers; its activity stays) and the app restarted for him to ask again.

**No limits; the person stops (2 Oct, after Kenil's first real build stopped on the 80-step
cap with 11 sources to go):** no `--max-turns`, no time limit on a run, no cap on a build's runs.
`claude_cli.LIVE` knows every run by its turn and thread and stops it with its whole process
group; Stop in the conversation (`/api/turns/{key}/stop`) and on a running build's card
(`/api/plans/{id}/stop`); a stopped build reports what it made and resumes on "continue" or
Continue building (`plan_resume`, `/api/plans/{id}/resume`).

### 4.8 Known, assumed or asked (built 2 Oct 2026)

Why: "i had a for godness shake 35g protien shake" (2 Oct, 14:33) was logged as 160 kcal, 3 g
carbs, 5 g fat, estimated; the label (one search away) says 215 kcal, 16.8 g carbs, 0.7 g fat.
Every row the Nutrition module had ever written was an estimate, the "≈" mark in a cell was the
only sign, and the build had never tried a branded product. Rule 1 of the turn said "sensible
estimates… No research", my implementation of "plain logging stays instant"; the module Alpha
built had no idea where a number comes from; nothing compared Alpha's answers with reality.
Kenil: "i want alpha to be trusted same as people would trust claude", and the principle: if
Alpha doesn't know, ask, or at least say what it assumed; never just do anything. The build:

- **Rules** (`runtime/turn.py`): a plain action is still done in the turn, but every value is
  stated, looked up (whatever can be known is looked up and its source kept) or estimated and
  said so; an unknown the result depends on is asked about or assumed out loud; replies say where
  each number came from. Plans name their trial. `BUILD_RULES`: a table whose values come from
  outside gets its way of obtaining them built and tried on a real item; fix how a value is
  obtained, never the one row.
- **Provenance** (`mcp/tools.py` `provenance_of`): `records_add`, `records_update` and
  `table_start` take `source` ("stated", "estimated", or where it was read) and `assumed`;
  journal lines say "(from label on ocado.com; assumed the 330 ml bottle)". The table page shows
  "≈" for estimates, "?" for a value resting on an assumption, the source in the cell's title,
  and "4 estimated, 1 on an assumption" beside the row count.
- **The check** (`runtime/check.py`): `TurnRequest.kind` is `turn`, `independent` (web search
  only, no MCP) or `judge` (no tools); `check(world, turn)` journals `checked` and, on a sourced
  difference or an unstated assumption, runs a repair turn whose reply lands in the conversation.
  `Turns` runs it in the background after a turn whose records Alpha worked out
  (`worth_checking`); `alpha check [turn]` runs it by hand.
- **Builds** (`runtime/build.py`): `plans.trial` and `plans.checks`; a finished build runs the
  trial in its thread as the person would say it, checks it, removes the trial's rows, and is
  sent back with the finding while it differs (`TRIAL_REPAIRS = 2`); the report ends with what
  was tried and what the check said.

### 4.9 Status at the end of 2 October 2026: done, pending, what changed

**What changed today, in one breath.** Alpha went from "builds on a guess, runs, and calls it
done" to: it asks and proposes first, builds only after a yes and in the background, keeps every
place it reads from with a status, writes know-how as pipelines that run without a model, has
no step or time limits (the person stops), knows where every value it writes comes from, and
checks its own answers against an independent one. The three failures that drove it: the blind
ETA build (§4.7), the LinkedIn reader "concluding" a cap from one failed attempt (§4.0 of the
design), and the shake logged as a guess when the label was one search away (§4.8).

**Done (committed, tested, run for real):**
- Memory and data foundations: row history, rows that are people, threads as records, the kept
  context per turn, dated lines, instructions in the person's own words (§4.6).
- Plan first by mechanism; sources with a status and a coverage line in every report; readers
  that mark rows seen and gone and say whether they read every page; pipelines (read steps and
  tell steps) with one repair turn; background builds that continue from the brief, resume
  after a stop, and have no limits; plan cards and the sources list in the app (§4.7).
- Known, assumed or asked; provenance (`source`, `assumed`) on records and in the table page;
  the second opinion after turns Alpha worked values out and by `alpha check`; a trial on every
  plan, sent back up to twice (§4.8).
- Removal: a module's readers go with it; the audit stays.
- The app rebuilt and restarted on this (14:58).

**Pending, in order of how much they matter:**
1. **The suite of real journeys**: built the same evening (§4.11), first run 4 of 5 with the
   one failure in a check's wording; it runs with `just journeys` after any change to how Alpha
   behaves.
2. **The sleep-time pass and scenario suite** (A). Beliefs still go stale only by being
   overwritten; nothing links people across Gmail and LinkedIn; nothing consolidates.
3. **Proactivity** (B): triage, digest, Inbox. Alpha still never brings anything to the person
   except an automation's "Worth telling".
3a. **The write route, next steps** (§4.13, §4.15): the draft and the send both ran for real in
   the app on 2 Oct; a send journey in the suite (a fresh yes, verified in Sent); a LinkedIn
   message as the second procedure with no new platform code; sentences for sends after real approvals;
   upload steps; say on the card when a dry run already leaves something behind (autosave).
4. **The old estimates**: the four food rows logged before today stay estimates until the person
   logs or asks about them again; the check only runs on new turns. A sleep-time pass could
   re-check old estimates; not decided.
5. **Cost of the check**: two extra runs on the subscription after every turn where Alpha
   worked values out, and three model runs per trial. Fine for one person; worth measuring over
   a week before anyone else uses it.
6. **Readers still show "not_built" after their reader ran** in one case (the Accounting Biz
   source, 13:50). Cause found on the code read: `sources.ran` updates rows `WHERE reader = ?`,
   and a source added before its reader keeps `reader = NULL`, so the run creates a second
   source row for the reader instead of claiming the first. Fix: claim by URL or site when the
   reader's row is first created. Not fixed.
7. From §4.4, unchanged: LinkedIn reads the whole list daily (reading only what is new would
   be gentler); desktop-control and app-scripting hands not built; `page_to_table` still in the
   platform; the photo-vs-name driver fix in `git stash`; not shippable to anyone else (venv,
   self-signed, subscription login needs Anthropic's approval); the Agent SDK's flag support
   unverified.
8. **Housekeeping**: a stray `alpha serve --port 53911` from an earlier session runs against a
   scratch world (kill it); the calendar's real first read has never been run.
9. **From the code read of 2 Oct evening (§4.10).** Decided and done the same evening: the
   schedule floor is 30 minutes (Q22); the site vocabulary is out of the hands (Q23); `just
   lint` is clean again; the trust holes are closed (§4.12). Still to fix: the dead code list
   and the smaller inconsistencies in §4.10. The app must be
   rebuilt (`just app`) to pick the evening's changes up; Kenil's world folds its old
   `linkedin` keys into `url` on the next open.

**Decisions taken today that bind what follows:** never build on a request, propose and wait
for the yes (by mechanism, not prompt); know-how is code (pipelines, readers), the model is for
repair and judgement; no limits anywhere, the person stops; nothing per use case; a knowable
value is looked up, an unknown is asked about or assumed out loud; "it ran" is not "it works".

### 4.10 The code read against the docs (2 Oct 2026, evening)

Every file under `core/alpha`, `connectors` and `desktop/src` (+ `src-tauri/src/lib.rs`) was
read in full and set against the design and this plan. The docs were corrected in place (the
italic notes in §3 and §4, the *As built* paragraphs in the design). What follows is what the
read found beyond wording: things the docs claimed that the code does not do, things the code
does that no doc said, and plain faults. Nothing here was fixed; it is the list to decide on.

**Limits that exist although Q18 says none** (all in platform code, none a setting):
automation schedules had a 15-minute floor (`world/automations.py`; **now 30 minutes by
decision, Q22**); a page read waits at most
180 s (×3 when reading to the end) and a sign-in window 30 minutes (`connectors/browser.py`);
the driver gives a page 30 s to load, 6 s to go quiet, at most 400 scrolls and stops after four
rounds with no new links, keeps 5,000 links and returns 800, 60,000 characters of text; files
over 50 MB are skipped, text cut at 400,000 characters, spreadsheets at 20,000 lines; the
pre-pack is cut at 12,000 characters; an automation's last result and the independent answer
are kept to 2,000 characters; a build is sent back at most twice over its trial. The timeouts
and sizes are the hands protecting themselves; the schedule floor was the one product limit,
and Kenil kept it at 30 minutes.

**Site vocabulary in the hands** (against §4.0 of the design, Q17), **removed the same evening
(Q23)**: `browser_session.mjs` treated `/authwall`, `/checkpoint` and `/uas/login` as sign-in
walls and knew "Show more connections" and "Show more jobs" as paging; `entity_resolve` filed a
linkedin.com URL under a `linkedin` key while table rows filed every URL under `url`, so the two
never matched; the browser `SKILL.md` had a Sites section with LinkedIn and We Work Remotely
addresses in every run's prompt. Now: wall paths are `login`, `signin`, `signup`, `auth` plus a
visible password field; paging is any "Show more …" button; `url` is the one address key and a
world folds old `linkedin` keys into it on open (`store._migrate`, tested); the skill says the
hand knows no site. Vendor markers for bot checks (Cloudflare, PerimeterX, DataDome) are
platform-level and stay. Proven by tests only; the real LinkedIn sync has not been rerun since.

**The read-only guard is narrower than §4.0 states.** Requests that would change data are
blocked only while Alpha's script runs inside `page_script`; a plain `page_read` installs no
blocking. The driver never clicks, types, submits, uploads, downloads or screenshots (it
presses "Show more" and scrolls), so a read stays read-only by the driver's behaviour, not by
a mechanism. A sign-in counts as done when the profile holds any cookie for the site.

**Trust mechanisms with holes.** `check.worth_checking` finds a turn's records through journal
entries carrying `data.record`; `records_upsert`, `page_to_table` and `reader_run` journal
counts only, so a turn that only upserted is never second-opinioned and a trial that upserted
leaves its rows behind. `provenance_of` turns an omitted `source` into `estimated`, so a model
that forgets the argument files a stated value as a guess. Rows from pipelines, upserts and
the person's edits carry `by` and `turn` only. The store enforces nothing about provenance.
Facts, notes and entities each record their source in a different format (`turn:<id>`, the
bare id, `record:<table>/<id>`); goals have none.

**The plan-first gate covers creation only.** `_gate` guards `module_create`,
`collection_create`, a new `reader_save`, `automation_create` and `source_add`. Not guarded:
`table_start` (which also creates a module when it names one that doesn't exist),
`collection_add_fields`, replacing an existing reader's script, `automation_update` (schedule,
steps, procedure), `records_upsert`, `page_to_table` outside an automation, and `run_reader`
outside a build creates a source row. `Automations.update` cannot clear `steps` or empty a
procedure.

**Entities.** Same-name candidates are returned by `resolve` and by `/api/entities/{id}` and
shown nowhere; `merge` is reachable only through an API route the app never calls and is
journaled only there; `unmerge` and `delete_note` have no caller; `_index` uses `INSERT OR
IGNORE`, so a key already owned by another entity is silently listed in the new entity's JSON
while `entity_keys` keeps pointing at the old one. `journal.entity_ids` is written by files,
calendar and the merge route, never by the tools. The calendar's first sync journals one line
per event.

**Removal.** `clear_conversation` deletes stream turns physically (the one exception to the
tombstone rule; it also removes the `proposed` rows plans point to). `remove_connection`
inspects an automation's `procedure` for the connection's readers but not its `steps`, and
leaves `sources.reader` and `records.reader` naming deleted readers. Nothing ever purges
`plans`, `threads`, person facts, entities made from tables or `meta`.

**Desktop.** `DataPage` tests field kinds `boolean` and `multiselect` while the core's are
`bool` and `multichoice`: a bool field edits as plain text seeded with "true"/"false", and the
Yes/No select, the ✓ rendering and the multichoice placeholder are unreachable. The
conversation panel sends a message scoped to the page's module but loads the stream unscoped.
`home.brief` is typed and never rendered; `client.modules/people/entity/merge/search` are never
called; `~110` CSS selectors from the old shell are orphaned; the CSP in `index.html` differs
from `tauri.conf.json` (`blob:` in img-src). Launch at login (Q2) is not built. The companion
takes focus when opened. The bundled app runs Python from the checkout it was built in
(`CARGO_MANIFEST_DIR/../..`) with a hard-coded PATH; `ALPHA_HOME` is honoured in debug builds
only; core stdout after readiness goes nowhere. Polling: Home 20 s, Claude status 60 s, the
panel 15 s or 5 s, the companion 30 s, automations 4 s while running; while a thread works the
panel re-fetches every mounted page every 5 s. Fonts come from Google Fonts. Three desktop
tests exist (rail, surface, provenance split); none for DataPage, the panel, Home, Settings,
Intelligence or the companion.

**Dead code.** `threads.session_ref` (never set; nulled on open), `modules.project` (never
read), `Plans.waiting`, `Entities.unmerge`, `Journal.forget`, `Knowledge.delete_note`,
`Browser.signin` (the blocking one), `Browser.sites`, `Browser.read(signed_in=…)`,
`Files.unwatch`, `Calendar.status`, `RunResult.raw`, the `error_max_turns` / `cut_off` /
`OUT_OF_STEPS` path from the max-turns era, `Sources.coverage(None)` (always zero), the driver
job keys `html`, `timeout_ms`, `scroll`, `max_scrolls`, `locale`, `browser` that Python never
sets; in the app `ModulePage.onGo`, `Activity.onChanged`, `initials()`, `TEXT_KINDS`,
`CHOICE_KINDS`, a duplicate `HANDOFF_KEY`.

**Smaller inconsistencies.** Two `site_of` with different meanings (`sources.py`: host minus
`www.`; `browser.py`: registrable domain), bridged by a `LIKE`; note scope by module *name*
while everything else keys on the id; `decide_fact` overwrites `recorded_at`; `record_fact`
returns an existing identical fact without updating `why` or `source`; `Collections.upsert`
ignores tombstoned rows when matching keys, so a deleted row re-synced comes back under a new
id; `_link` runs in its own transaction after the write; `documents_fts` has no delete trigger
(the purge deletes by hand); `automation_views` finds a running automation's steps by the
literal text "Run the automation"; `automation_create` opens a thread and marks it done at
once; only a hash of the rules is kept with a turn, not their text, so `alpha context` cannot
show which rules applied; the `cli.py` and `prepack.py` docstrings and the browser
`connector.yaml` tool list were out of date (fixed in this pass).

**Counts, measured (end of the evening):** 113 core tests in 12 files; 3 desktop tests; 63
tools; ruff clean; mypy strict clean (the 16 errors in three test files fixed); `tsc` clean.

### 4.11 The journey suite (built 2 Oct 2026, evening)

Why: every trust mechanism so far checks one answer; nothing re-ran the journeys that matter
after a change, so each "Again!" was found by Kenil using the app. §4.9 item 1.

- **What a journey is**: a YAML file in `journeys/` with `steps` (a `say` as the person, a
  `reader` run, an `automation` run by title, or `build` of the newest plan) and `checks`
  (`independent`: the second opinion on the last turn agrees; `row` / `near`: a row this
  journey added, its source and a value within a tolerance; `no_new_tables`,
  `no_new_modules`, `plan`: nothing lasting before a yes; `reply`; `judge`: a rubric judged by
  a no-tools run; `count`, `reader_health`, `automation`, `journal`). Every step and check is
  timed and says why.
- **Where it runs**: `core/alpha/journeys/suite.py` copies the world with SQLite's backup and
  the browser profiles (minus Chrome's lock files) into a scratch `ALPHA_HOME`, so signed-in
  sites read as the person and the live world is never written. The same `turn.ask`,
  `run_reader`, `automation.run` and `build.run_build` the app uses; builds run to the end as
  the scheduler would. The report is `docs/journeys/<stamp>.md` + `.json`. `alpha journeys
  [names] [--world] [--keep] [--list]`; `just journeys` wraps it in `caffeinate`.
- **The five journeys**: `branded_food` (a 45 g Cadbury Dairy Milk bar: a row not estimated,
  calories within 10% of 240, the second opinion agrees); `vague_tracker` ("keep track of all
  the AI conferences in London this year": no table, no module, a plan proposed, numbered
  questions); `linkedin_sync` (the person's reader reads the whole list: health ok, at least
  95% of its last good count); `gmail_network` ("which of my LinkedIn connections emailed me
  in the last 7 days": Gmail was read, and a judge checks the answer names senders from the
  table or says plainly none / needs sign-in, never invents); `eta_daily` (the pipeline runs
  with no model and reports "Read N of M sources", only sign-in and bot-check problems
  allowed).
- **Tests**: `core/tests/test_journeys.py` runs a journey with a fake model on a copy and
  shows the live world untouched. 115 core tests.
- **First real run** (2 Oct 17:49, Sonnet, a copy of Kenil's world; `docs/journeys/2026-10-02-1749.md`):
  4 of 5 passed in 7½ minutes. Branded food: 240 kcal from fatsecret.com in 33 s, the second
  opinion agreed (58 s in all). Deal pipeline: 15 of 15 sources read with no model, 111 s.
  LinkedIn: 1,551 of 1,551 through the generic driver (Q23 holds on the real site), 147 s.
  Vague tracker: a plan with one source found and numbered questions, nothing built, 59 s.
  Gmail × network: the answer named one connection with what he wrote and excluded three
  senders not in the table; the judge passed it, my `journal` check failed because it matched
  the entry's text for `mail.google.com` while the text says "(google.com, signed in)" (fixed:
  the check now matches the entry's URL). **Found by the run:** the pipeline's tell step
  reported "818 new" on a table of 831 because a first run measured changes from the
  automation's creation, so rows made while the module was built counted as new.

### 4.12 Trust holes closed (2 Oct 2026, evening; §4.9 item 9, §4.10)

- **Tell steps measure from the last run only.** A first run sets the baseline and says so
  ("First run: what is new, changed or gone is reported from the next run"); nothing is journaled
  as `noticed` on it (`runtime/pipeline.py`).
- **Synced rows are known as synced.** `records_upsert` and `page_to_table` mark provenance
  `synced: true` and journal the ids they touched (capped at 500, `records` in the entry's
  data), as reader runs now do too. `check.records_of` reads both `record` and `records`, so a
  trial can remove rows it upserted; `worth_checking` skips synced and reader-written rows (a
  page copied is not a value Alpha worked out) and still checks looked-up and estimated ones.
- **`source` is required on `records_add`.** A forgotten argument is a tool error the model
  sees, never a stated value filed as a guess. `table_start` defaults to `stated` (it logs what
  the person just said); `records_update` keeps "left out means unchanged".
- **The app's field kinds match the core's** (`bool`, `multichoice`): a bool field edits as
  Yes / No again and shows ✓.
- **The conversation panel loads the stream scoped to the page's module**, as it sends.
- **Removing a connection reads pipeline `steps`** as well as procedures for the readers it
  takes, and the sources those readers fed go to `not_built` with "Its reader went with the
  linkedin.com connection", so the module still shows where it reads from.
- Still open from §4.10: the dead code list, `clear_conversation`'s physical delete,
  `Entities._index`'s silent key conflicts, `decide_fact` overwriting `recorded_at`, the
  calendar's first-sync journal flood, the LinkedIn automation's procedure naming the old
  `linkedin` key (Alpha's own know-how; the error now says to use `url`).


### 4.13 The write route (built 2 Oct 2026, evening; Q24)

Why: "preprae a draft email to saniahussain417@gmail.com … make it as a poem" was answered
with a note and "Alpha can't send emails yet". Kenil wanted acting opened generically, with
guardrails and approvals, not a Gmail-only send. The design is §6.1 of the design document.

- **Store**: `procedures` (name, site, url, description, effect prepare | send, steps JSON,
  verify JSON, fields, version, health untried | ok | broken), `actions` (procedure, title,
  payload, evidence, undo, effect, site, state proposed → approved → running → done | failed,
  or declined; proposal, approval, preview, shots, result, error), `permissions` (sentence,
  procedure, effect, granted_at, revoked_at). `world/actions.py` validates steps: one of
  goto, click, click_text, fill, type, press, wait, wait_ms, expect, expect_text per step; a
  fill or type value is exactly one `{field}` of the payload; the last step is a click,
  click_text or press (the commit).
- **The hand**: the driver's `act` op (`browser_session.mjs`): the person's profile, the
  steps, the payload values, `stop_before_last` for a dry run, screenshots `before`,
  `preview` / `after`, `error`, `verify`; it refuses to type into a field whose type,
  autocomplete, name, id, label or placeholder says password, passcode, one-time code, card,
  CVV, IBAN, SSN or passport, whatever the step says; bot checks and sign-in walls stop it
  before any step. `Browser.act` requires a connected sign-in for the site and journals every
  run with its step log and screenshots.
- **The runtime** (`runtime/acting.py`): `dry_run` (every step but the commit; the preview on
  the card), `perform` (all steps, then the procedure's `verify` checks; on a failed step or
  check the action fails, the procedure is marked broken and, in the app, a repair turn with
  `REPAIR_RULES` has Alpha look at the page, fix the procedure and propose afresh), `approve`
  (the person's yes; `always` grants the standing sentence for a prepare-level procedure),
  `decline`. The scheduler's tick performs approved actions the app missed.
- **Tools**: `procedure_save`, `procedures_list`, `action_propose` (dry-runs at once; runs
  at once under a standing permission), `action_approve` (the person's words after the card;
  refused in the proposing turn), `action_decline`, `actions_list`. Rule 9 of the turn now
  says how; the browser skill has an Acting section.
- **API and app**: Needs you shows a proposed action as a card (its own `proposed` entry is
  not shown twice); `/api/actions`, `/api/actions/{id}`, `/shots/{name}`, `PATCH` to change
  the text before the yes (the preview goes stale), `/approve {always}` (runs in the
  background), `/decline`; `/api/intelligence` lists procedures and standing permissions;
  `/api/permissions/{id}/revoke`. `ActionCard` (Home and the conversation): payload, the
  dry-run screenshot, the undo statement, Do it / Always allow (prepare) / Change / Not now;
  Knowledge has "Standing permissions" with Revoke. Removing a connection deletes its
  procedures, declines their pending actions and revokes their permissions.
- **Tests**: `core/tests/test_actions.py` (the step walls, the dry run, the yes, always and
  revoke, a send never gets a sentence, a failed run marks the procedure broken and calls the
  repair, the API, removal). 124 core tests, lint and types clean.
- **The real run** (journey `gmail_draft`, 18:20–18:32, a copy of Kenil's world, his real
  Gmail profile): Alpha read the inbox, ran five scripts to see Gmail's compose controls, and
  in about two minutes kept `gmail_draft` (open `#inbox?compose=new`; fill "To recipients";
  fill the subject box; type into "Message Body"; click "Save & close"; verify
  `expect_text: "Draft saved"`), proposed the action with the poem as payload, and the dry run
  filled a real compose window and stopped before the last step: the preview screenshot shows
  the draft with "Draft saved" in its header. The suite's yes performed every step in 28 s.
  The draft exists in Kenil's Gmail (Drafts went from 1 to 2 in the after-screenshot). Alpha's
  own verify check then failed, because after Save & close the "Draft saved" text is no
  longer on screen, so the action is `failed` and the procedure `broken`: the right answer
  for a check that is wrong, and Alpha's to repair in the app (the suite runs with no
  repair). **Found:** (1) Gmail autosaves while the body is typed, so a dry run already leaves
  a draft; a prepare-level dry run is not side-effect-free on sites that autosave, which is
  fine for a draft and must be said on the card for anything else. (2) The suite continued a
  build copied from the live world (Kenil's Founding Engineer tracker, state `building`) and
  spent the subscription twice until I killed it; the suite now settles only plans it
  proposed, and the profile copy tolerates Chrome's transient files. (3) A stray core on port
  53911 from an earlier session was pointed at by `desktop/.env.development.local` (untracked);
  stopped, and the file now names the scratch core used for checking the app.

### 4.14 A build is watched, not waited for (2 Oct 2026, evening)

Kenil, looking at Home while a build ran: "I should be able to see whats happening while its
getting built". `/api/home` and `/api/conversation` now return each open thread with its last
six journal entries (`thread_views`: did, saw, made, changed, failed, noticed, asked, checked;
the build prompts left out) and a step count; Home's "Alpha is working on" card lists them live
and has Open, which opens the thread in the conversation panel; the panel's thread card shows
the latest step and the open thread view refreshes every four seconds while it works. Checked
in the browser pane against a scratch core on a copy of his world: the Founding Engineer build
showed its seven steps (table made, two readers written, the automation set up, the brief
updated) and Open landed in "Thread · working".

### 4.15 The first real sends, and what they broke (2 Oct 2026, 18:43–18:54)

Kenil, in the rebuilt app: asked for the draft again (Alpha wrote `gmail_draft` afresh, 95 s,
dry run, card; Do it made it, 17:44), then "ok, send it as well now". Alpha wrote
`gmail_send_draft` (open Drafts, open the newest row, Send; verify "Message sent") and the
email **was sent to Sania at 17:50:11 with the verify passing**: the route works end to end,
draft and send, both procedures Alpha's own. Then "send an email for the trip to Mitansh as
well": Alpha declined on its own judgement (a LinkedIn connection with no trip context) and
Kenil asked why it had assumed a romantic poem, which it answered honestly (no fact on file).

**What the trace showed, and what was fixed the same evening:**

1. **A false "Sent".** The first send card (17:47:38) was marked *Sent* one second after Do
   it, with no step log and no screenshots: the hand had thrown, `perform` caught it as
   `failed_step: 0`, and `0` is false. Nothing was sent then. Now any exception is a failure
   (`_failed`: raised, wall, failed step, failed check, or no `done`), journaled as `failed`
   with the error, the procedure marked broken.
2. **A card before its preview.** The action is created, then dry-run; between the two the
   card was visible with Do it enabled, while the model turn was still rewriting the
   procedure. Now a proposed action carries "The preview is being made." until the dry run
   finishes, the card's Do it and Always allow are disabled until then, and `approve`
   (tool and route) refuses without a preview. A dry run that fails now fails the action
   (the card shows why and can't be approved); an edit of the text redoes the dry run.
3. **Two Chromes on one profile.** The three procedure versions in a row were almost
   certainly the model's dry run and the person's approval (or a read) opening the same
   Gmail profile at once, which Chrome refuses; the error was lost. `Browser.runner` now takes
   a file lock per profile (`alpha-busy.lock`, `flock`) around every job, across the MCP
   process and the core, so reads and acts on one sign-in take turns.
4. **The screenshot didn't show** in the app: the page's own CSP (`index.html`) lacked `blob:`
   in `img-src` while `tauri.conf.json` had it; both apply. Fixed. The card is leaner: short
   fields on one line, the long one as the body in a scrolling block, the screenshot only
   once it has loaded.
5. **Slow**: the first draft turn took 95 s because the procedure had to be written against
   the real page (Gmail read, five scripts); a second draft is one dry run (about 20 s). The
   send took four minutes because of (3). Not changed: a procedure is written once per task
   per site and reused.

126 core tests (two added for 1 and 2); lint and types clean. The app rebuilt (`just app`).

### 4.16 The runaway build (2 Oct 2026, 19:51–19:55; fixed 20:10)

Kenil: "something is messed up with alpha when it tried to build a module. shut it and debug".
The conversation showed the same stop report nineteen times in four seconds for "Advisory-
relevant attachments from Vikas Badami". The core log and the journal gave two faults:

1. **Every pre-pack crashed from 18:51:28.** Alpha had deleted one row ("Removed Data from
   Vikas Badami Attachments"); `records_delete` journaled the row's values under `removed`,
   the key the removal convention uses for modules and connections, and
   `Journal.removals()` read `removed["name"]` from every such entry. One deleted row, and
   `prepack.build` raised `KeyError: 'name'` on every turn after it: the build's trial, the
   "Continue the build" runs, and Kenil's own "what is going on, take a step back" (the API
   logged `turn failed`). Fixed: `removals()` reads only entries shaped as a removal (kind,
   id, name) and never raises; a deleted row's values ride under `was`; a test deletes a row
   and runs the pre-pack, with an old-shaped entry left in the journal.
2. **The plan card fired two requests per press.** `PlanCard.decide` built the yes request
   eagerly (`const go = client.resumePlan(…)`), so "Leave it" on a stopped plan resumed it
   and declined it at once, and "Not now" on a proposed plan approved it and declined it. The
   decline was refused (the plan was building by then) after journaling "No", the resume
   started a run, the run died on (1) and stopped, and each press repeated it. This card
   has been wrong since it was added on 2 Oct at noon: a plan "declined" in the panel was in
   fact built. Fixed: one request per decision; `decide_proposal` moves the plan's state
   before it journals the answer, so a refused decline leaves nothing; a test.
3. **A crash in the trial left the plan building forever** (the build itself had finished at
   18:51:44). `run_build` now ends such a build as stopped with the reason.

The world after: the plan is `stopped` and can be resumed (the Advisory module, its
attachments table and reader exist; the trial never ran); the nineteen stop reports stay in
the journal, as history does. 128 core tests; lint and types clean; the app rebuilt.

### 4.17 Files in and out (built 2 Oct 2026, late evening; Q25)

Kenil: downloads from connections (attachments) and uploads (a module that takes files), "lets
discuss"; the five decisions are Q25. Built:

- **Store and world**: `documents.module`, `documents.origin`; `Files.take(path, module,
  origin, move, by)` keeps a file in `files/<module>` under the data directory, extracts text
  where it can, makes the document and its entity, journals (`did` for Alpha, `changed` for the
  person); `Files.document`, `Files.of_module`; field kind `file` (a document id); a module's
  removal deletes its documents and files (inside Alpha's folder only).
- **The hand**: driver `download` (direct address through `context.request` with the
  session's cookies, or the file a control hands back via Playwright's download event; an HTML
  answer is a wall, not a file) and an `upload` step (`setInputFiles`, only under
  `files_root`); `Browser.download` with the journal line; `Browser.act` passes the resolved
  file paths; `acting._files` resolves payload fields of upload steps to documents Alpha keeps
  and refuses others.
- **Tools and rules**: `page_download(url, module, click, click_text, name)`; rule 8 (fetch
  only when the plan said so or on an ask; a dropped file arrives as a turn), rule 9 (an
  upload is a send); the browser and files skills.
- **API and app**: `GET /api/tables/{name}` carries a `files` map for file fields;
  `POST /api/tables/{name}/export {csv|xlsx}` writes to `exports/` and journals;
  `GET /api/documents/{id}`; `POST /api/files` (multipart: module, or table/record/field)
  keeps the files and starts Alpha's reading turn (actor alpha, journaled as "Read X the person
  added"); `Turns.start` takes an actor. The app: a file cell (name, size, Open, Show in
  Finder, Add file), a drop zone on the module page, Download as CSV / Excel in the table
  menu, file names on action cards; host commands `open_path` and `reveal_path` (inside the
  data folder only); `dragDropEnabled: false` so the webview gets HTML5 drops.
- **Tests**: `core/tests/test_files_in_out.py` (a fetched file lands as a document and on a
  row; a page instead of a file is not a download; dropped files are kept and the row path;
  removal takes the files; an upload step sends only a file Alpha keeps; CSV and Excel export).
  134 core tests; lint and types clean.
- **Journey** `attachment_in` ("fetch the ETA Tracker CSV that Vikas Badami emailed me into
  the Advisory module and tell me how many rows it has"), 2 Oct 21:59, a copy of Kenil's world,
  his Gmail profile: Alpha opened the "Data" email, fetched "ETA Tracker Accounting Vikas
  (email attachment).csv" through the session (2,068 bytes, 50 words), kept it in
  `files/advisory` as a document, and answered "20 data rows … plus a header row" (right),
  39 s in all; it also noticed an older copy of the same file in the watched "alpha docs"
  folder. The suite's first run failed on the journey file (an unquoted colon; bad YAML is now a
  plain error) and the second on the reply check's regex (bold marks between "20" and "rows";
  widened). The mechanism itself passed first time.

### 4.18 The conversation, Claude-like (2 Oct 2026, late evening)

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
  front. The cost is context per turn; the gain is one fewer round trip on every turn (a
  real question answered in 34 s on the copy before the change; to be measured after).
- 135 core tests (a streamed run is watched and read); lint and types clean; the app rebuilt.

### 4.19 Three more journeys, and a hole in the hand (2 Oct 2026, 22:02–22:30)

`docs/journeys/2026-10-02-2202.md`, a copy of Kenil's world, his profiles:

- **gmail_send** (a send with a fresh yes): Alpha wrote a compose-and-send procedure against
  Gmail (196 s, the earlier `gmail_send_draft` sends an existing draft, so a new one was
  needed), the dry run filled the compose window, the suite's yes sent it in 11 s and the
  verify passed ("Sent … Checked afterwards"). The email went to Kenil's own address.
  **Passed.**
- **plan_declined** (a no builds nothing): "keep track of every book i read this year with my
  rating" → a Books plan with three numbered questions in 29 s; the decline through the app's
  route closed it in 2 s; no table, no module. **Passed.** (The questions were prose, not
  `ask_person` options: the run started before rule 10 changed.)
- **linkedin_message** (the second site, no new platform code): Alpha found Mitansh's profile,
  wrote `linkedin_message` four times over 381 s, and every dry run timed out waiting for the
  message box; it concluded LinkedIn blocks automated messaging. The error screenshot said
  otherwise: "This page doesn't exist". Alpha had written the procedure's address as
  `https://www.linkedin.com/in/{profile_slug}/` and a selector with `{profile_urn}`, expecting
  the hand to fill them from the payload as it fills typed text, and the hand opened the
  literal address. **Failed, platform's fault.** Fixed: a `{field}` placeholder anywhere in the
  address, a selector, a click text or a goto is filled from the approved payload (the payload
  is on the card, so nothing hidden reaches the site); every placeholder must be a declared
  field; proven on example.com (address and selector filled, step done).
- **linkedin_message, rerun** (22:16, `docs/journeys/2026-10-02-2216.md`): **passed** in 550 s.
  Alpha wrote `linkedin_message` seven times and landed on four steps: `goto` LinkedIn's
  compose overlay with `{recipient_urn}` in the address, wait for the message box, type
  `{message}`, click Send; the dry run composed the message and the card waits with its
  preview; nothing was sent. The second site cost no platform code beyond the placeholder fix;
  nine minutes is the price of learning a site once.
- A lesson for the repair loop: Alpha's diagnosis ("anti-automation") was wrong because it
  never saw the error screenshot. `action_propose`'s failure answer now carries the step log;
  giving Alpha the screenshot itself (a `page_read` of the final page, or the image) is open.

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
