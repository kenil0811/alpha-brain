# Build plan

1 October 2026; brought up to date 2 October 2026 (§1, §4.2–§4.5). Written so that any session
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
- **Sessions** are one visible stream plus threads with their own model context, opened
  automatically for any work item; no session picker; memory lives in the world, never in a
  session.
- **Building happens in the one conversation** (Kenil, 1 Oct): an explicit "I want to build…" is
  researched, decided and built in the same conversation, even when it takes minutes; the
  separate deepen threads were removed. Threads remain for automations (each has its own).
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
  connection. 25 commits; 76 core + 3 desktop tests. **Where we stand and what is open: §4.3–§4.5**
  (the recon of 2 Oct). Slices 3–6 of the order of work have not started.

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
  --permission-mode dontAsk --permission-prompts none   ("default" is not a mode in 2.1.278;
                                                          dontAsk refuses anything not allowed)
  --setting-sources ""
  --model $ALPHA_MODEL (default "sonnet")
  --max-turns 20                        (now 80; see §4.2)
  [--no-session-persistence]            stream turns are stateless; the pre-pack carries context
  [--resume <session_id>]               a thread resumes its own session
```

MCP config file: `{"mcpServers":{"alpha":{"command": sys.executable, "args": ["-m","alpha.mcp.server"], "env": {"ALPHA_WORLD": <store path>}}}}`.
Environment: inherit, ensure `USER`, never set `CLAUDE_CONFIG_DIR`. Timeout 300 s (now 900 s); on timeout
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
  Playwright driver unchanged, on the installed Chrome, per-site profiles the person signs into,
  non-blocking sign-in); *calendar* (EventKit, 30 days back / 60 ahead, attendees resolve to
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
  with thread cards and their own view; the companion with presence, bubble and panel.
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
- **Runtime values now**: `--max-turns 80`, timeout 900 s, Sonnet; stream turns stateless,
  automation threads resume their own session.

### 4.3 Where we stand (recon, 2 Oct 2026)

Against the design's order of work:

| Step | State |
|---|---|
| 1. World store, MCP server, stream, companion | Done |
| 2. Browser, files, calendar; derived pages | Done, plus §4.2. Calendar's real first read still not run |
| 3. Sensors, triage, sleep-time pass, digest, Inbox | Not started |
| 4. Entities and bi-temporal facts across sources | Partial: the layers exist; turns don't link people at scale (1,548 connections are rows, not people) |
| 5. Standing-things ladder, promotion from verified runs | Partial: automations exist; no ladder, no promotion |
| 6. Pending actions and Access | Not started: every outward write is refused |

Proven on real runs (the person's own world, the subscription): LinkedIn connections read in
the person's session (1,548 rows, daily at 07:00, Alpha's own reader); Gmail read through the
browser (tracking and shipment details from the last 100 emails; then emails from LinkedIn
connections in the last 24 hours and what one of them said, the first answer joining two
sources); Nutrition (tables plus a weekly review automation). Proven only by tests: the calendar
connect, Install and Sign in from Settings on a fresh Mac, the try-the-sign-ins-you-hold path.

### 4.4 What the recon flagged

1. **Gmail went against decision Q4** ("keep Gmail out of scope until a Google app is justified;
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

### 4.5 What next (proposed 2 Oct, for Kenil to choose)

- **A. Sessions and memory** (Kenil wanted to think this through): stale beliefs, time sense,
  what a resumed thread may carry, linking people across sources, the sleep-time pass. The
  thesis, and where both real failures live.
- **B. Slice 3, proactivity**: triage of new data, the digest, the Inbox on Home.
- **C. The Gmail decision**: keep it in the browser with an explicit yes, move to the
  connector, or drop it for now.
- **D. A working rule**: three or four standing real journeys (LinkedIn, Gmail × network,
  nutrition, one new) that every change is judged against, instead of what was last noticed.

Recommended order: C quickly, then A, then B, with D throughout.

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
