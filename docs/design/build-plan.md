# Build plan

1 October 2026; the dated entries that grew here through 3 October 2026 moved to `docs/log/` on 3 October, and the current state to `docs/STATE.md`. Written so that any session
(or person) can continue from here without the conversation that produced it. The design it implements is `alpha-second-brain-design.md` in this
folder; read that first. This document is the engineering side: what is decided, what is verified,
what the first slice is exactly, and what follows.

## 1. Where we are

The current state is one page, rewritten every session: [`../STATE.md`](../STATE.md). What
each day built, ran and found is the dated log, [`../log/`](../log/README.md), one file per
entry, verbatim (§4 below maps the old section numbers to those files). The design this
implements is `alpha-second-brain-design.md` in this folder, intent only since 3 October, with
a status box under each section. This document keeps what does not change by the day: the
verified toolchain facts (§2), the first slice's shape (§3), what to port and when (§5), and
the open engineering questions (§6).

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
| Playwright / browser | `playwright-core` 1.62.0 driving the person's Google Chrome when it is installed (`channel: "chrome"`), else Playwright's Chromium (build 1234, Chrome for Testing 151) installed by `playwright` 1.62.0's own installer into `~/Library/Caches/ms-playwright` (about 250 MB; Alpha runs it on first run); per-sign-in persistent profiles | `connectors/browser`; the 9 Oct clean room |
| A shipped Alpha (Q34) | `just ship`: uv's standalone CPython 3.13.9 (`~/.local/share/uv/python/cpython-3.13.9-macos-aarch64-none`, relocatable, pruned to 36 MB), the locked packages into a plain `site-packages` (no venv), the official Node 24.21.0 binary from nodejs.org (Homebrew's links Homebrew libraries and cannot travel), the connectors; Tauri `bundle.resources` as an array keeps the tree (the glob form flattens it); 300 MB on disk, 96 MB zipped; self-signed, not notarized: right-click › Open, and the host clears the quarantine mark from its runtime | `desktop/scripts/ship.sh`, run 9 Oct |

**CLI flags that exist in 2.1.278 and matter to us** (from `claude --help` and the old harness
`services/core/alpha/builds/harness_claude_cli.py`, which runs in production today):
`-p/--print`, `--output-format json|stream-json`, `--include-partial-messages` (text deltas as `stream_event`s, used since 9 Oct for the reply as it is written), `--mcp-config <files…>`, `--strict-mcp-config`,
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
  mcp/tools/           plain methods bound to a World (testable), one module per thing touched
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
· MATCHES FOR THIS SENTENCE · THIS THREAD · OPEN), at most 12,000 characters (14,000 since
3 Oct night, each section within a budget of its own and the whole shrunk by section, never
cut blind; WHAT ALPHA HOLDS lists every table with its fields); WHO includes
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

### 3.6 MCP tools (`mcp/tools/`, registered in `mcp/server.py`)

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
`mcp/tools/` (a package since 3 Oct night, one module per thing the tools touch). Finding: `search` (records, documents, journal; no `kinds`), `journal_recent`,
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

## 4. The dated log (moved to `docs/log/` on 3 October 2026)

What each day built, what ran for real and what it found used to be dated subsections here;
they are now one file each in `docs/log/`, verbatim, and the current state is `docs/STATE.md`.
A reference anywhere to "build-plan §4.N" means the file below.

| Section | Title | File |
|---|---|---|
| §4.1 | Slice 2 as built (1 Oct 2026) | [`2026-10-01-4-1-slice-2-as-built-1.md`](../log/2026-10-01-4-1-slice-2-as-built-1.md) |
| §4.2 | After slice 2: what was built (1 Oct 2026, 10:13–23:44, 20 commits) | [`2026-10-01-4-2-after-slice-2-what-was.md`](../log/2026-10-01-4-2-after-slice-2-what-was.md) |
| §4.3 | Where we stand (recon, 2 Oct 2026; row 4 and the trust row brought to 3 Oct) | [`2026-10-02-4-3-where-we-stand-recon-2.md`](../log/2026-10-02-4-3-where-we-stand-recon-2.md) |
| §4.4 | What the recon flagged | [`2026-10-02-4-4-what-the-recon-flagged.md`](../log/2026-10-02-4-4-what-the-recon-flagged.md) |
| §4.5 | What next (proposed 2 Oct; where each stands at the end of the day) | [`2026-10-02-4-5-what-next-proposed-2-oct.md`](../log/2026-10-02-4-5-what-next-proposed-2-oct.md) |
| §4.6 | Memory and data foundations (built 2 Oct 2026) | [`2026-10-02-4-6-memory-and-data-foundations-built.md`](../log/2026-10-02-4-6-memory-and-data-foundations-built.md) |
| §4.7 | Plan first, sources, pipelines, background builds (decided 2 Oct 2026) | [`2026-10-02-4-7-plan-first-sources-pipelines-background.md`](../log/2026-10-02-4-7-plan-first-sources-pipelines-background.md) |
| §4.8 | Known, assumed or asked (built 2 Oct 2026) | [`2026-10-02-4-8-known-assumed-or-asked-built.md`](../log/2026-10-02-4-8-known-assumed-or-asked-built.md) |
| §4.9 | Status at the end of 2 October 2026: done, pending, what changed (items 10–11 added 3 Oct; the ordered list from here is the checkpoint's §10) | [`2026-10-02-4-9-status-at-the-end-of.md`](../log/2026-10-02-4-9-status-at-the-end-of.md) |
| §4.10 | The code read against the docs (2 Oct 2026, evening) | [`2026-10-02-4-10-the-code-read-against-the.md`](../log/2026-10-02-4-10-the-code-read-against-the.md) |
| §4.11 | The journey suite (built 2 Oct 2026, evening) | [`2026-10-02-4-11-the-journey-suite-built-2.md`](../log/2026-10-02-4-11-the-journey-suite-built-2.md) |
| §4.12 | Trust holes closed (2 Oct 2026, evening; §4.9 item 9, §4.10) | [`2026-10-02-4-12-trust-holes-closed-2-oct.md`](../log/2026-10-02-4-12-trust-holes-closed-2-oct.md) |
| §4.13 | The write route (built 2 Oct 2026, evening; Q24) | [`2026-10-02-4-13-the-write-route-built-2.md`](../log/2026-10-02-4-13-the-write-route-built-2.md) |
| §4.14 | A build is watched, not waited for (2 Oct 2026, evening) | [`2026-10-02-4-14-a-build-is-watched-not.md`](../log/2026-10-02-4-14-a-build-is-watched-not.md) |
| §4.15 | The first real sends, and what they broke (2 Oct 2026, 18:43–18:54) | [`2026-10-02-4-15-the-first-real-sends-and.md`](../log/2026-10-02-4-15-the-first-real-sends-and.md) |
| §4.16 | The runaway build (2 Oct 2026, 19:51–19:55; fixed 20:10) | [`2026-10-02-4-16-the-runaway-build-2-oct.md`](../log/2026-10-02-4-16-the-runaway-build-2-oct.md) |
| §4.17 | Files in and out (built 2 Oct 2026, late evening; Q25) | [`2026-10-02-4-17-files-in-and-out-built.md`](../log/2026-10-02-4-17-files-in-and-out-built.md) |
| §4.18 | The conversation, Claude-like (2 Oct 2026, late evening) | [`2026-10-02-4-18-the-conversation-claude-like-2.md`](../log/2026-10-02-4-18-the-conversation-claude-like-2.md) |
| §4.19 | Three more journeys, and a hole in the hand (2 Oct 2026, 22:02–22:30) | [`2026-10-02-4-19-three-more-journeys-and-a.md`](../log/2026-10-02-4-19-three-more-journeys-and-a.md) |
| §4.20 | The memory round: the benchmark first (3 Oct 2026, early) | [`2026-10-03-4-20-the-memory-round-the-benchmark.md`](../log/2026-10-03-4-20-the-memory-round-the-benchmark.md) |
| §4.21 | Conversations, first-class and parallel (built 3 Oct 2026, morning) | [`2026-10-03-4-21-conversations-first-class-and-parallel.md`](../log/2026-10-03-4-21-conversations-first-class-and-parallel.md) |
| §4.22 | Daily runs and the sleeping Mac (3 Oct 2026, morning) | [`2026-10-03-4-22-daily-runs-and-the-sleeping.md`](../log/2026-10-03-4-22-daily-runs-and-the-sleeping.md) |
| §4.23 | The wiki, noticing, and context by relevance (built 3 Oct 2026, afternoon; §3.7 points 2–4) | [`2026-10-03-4-23-the-wiki-noticing-and-context.md`](../log/2026-10-03-4-23-the-wiki-noticing-and-context.md) |
| §4.24 | Skills, the one unit of know-how (built 3 Oct 2026, afternoon; §3.7 point 7) | [`2026-10-03-4-24-skills-the-one-unit-of.md`](../log/2026-10-03-4-24-skills-the-one-unit-of.md) |
| §4.25 | The checkpoint (3 Oct 2026, afternoon) | [`2026-10-03-4-25-the-checkpoint-3-oct-2026.md`](../log/2026-10-03-4-25-the-checkpoint-3-oct-2026.md) |

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
