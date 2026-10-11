# Modules as programs: the prior art (10 October 2026)

Why this was looked at: after the research pass (Q37) the second car wash build was still one
table and a recipe, because a module has nowhere to hold a program. Kenil's bar is his friend's
Waterways engine (`~/Desktop/dev/project-waterways-main-2`): per-metro data layers, gates then a
score calibrated to the client's own documents, a table, a map, a per-site report, settings,
exports; built with Claude Code over a week, the human steering at each stage. Before designing
"modules as programs" he asked for what already exists, so nothing is reinvented.

Four passes by subagents reading docs, source and PyPI metadata, one of them probing Claude Code
on this Mac. **V** read or run today; **R** recalled or secondary.

## 1. Walls for a coding agent on a person's Mac

- **Claude Code's own Bash sandbox** (V, docs code.claude.com/docs/en/sandboxing; open source
  `@anthropic-ai/sandbox-runtime`, Apache-2.0, "beta research preview"): on macOS a generated
  deny-default Seatbelt profile (`sandbox-exec`), children inherit; no direct route out, only a
  localhost proxy that checks hostnames against `allowedDomains` (empty by default) and refuses
  loopback and own addresses; settings `sandbox.enabled`, `allowUnsandboxedCommands` (false
  kills the "disable sandbox" retry), `failIfUnavailable`, `filesystem.allowWrite/denyWrite/
  denyRead`, `network.allowedDomains/strictAllowlist/httpProxyPort/socksProxyPort` (your own
  proxy), `credentials.envVars/files`, `allowAppleEvents` (off: launched apps escape). Defaults:
  writes = cwd + `--add-dir` + a per-user tmp; reads = the whole machine unless denied;
  `.claude/*`, `.mcp.json`, `.zshrc`, `.git/hooks`, `.git/config` never writable. **Not covered:**
  Read/Edit/Write/WebFetch/WebSearch (policy-gated only), MCP servers, hooks.
  `--setting-sources ""` (which Alpha passes) drops user and project sandbox settings but
  `--settings '<json>'` still applies. **Probe on this Mac, Claude Code 2.1.278, macOS 26.6.2:**
  with `--settings '{"sandbox":{"enabled":true,"allowUnsandboxedCommands":false,
  "failIfUnavailable":true}}' --permission-mode dontAsk --allowedTools Bash`, `touch ~/x` was
  "Operation not permitted", `touch ./x` worked, `curl https://example.com` got "CONNECT tunnel
  failed, 403" with a violation notice. Standalone `srt --settings cfg.json <cmd>` wraps the
  whole process (file tools, MCP, hooks inside the wall); the docs recommend it for unattended
  runs. Proxy ports settable only from `--settings` or managed settings from v2.1.285.
- Flags (V): `--tools "Bash,Read,Edit,Write"` restricts built-ins; `--allowedTools "Bash(python *)"`
  is prefix-only and bypassable (`/usr/bin/python`, `sh -c`), so pair it with the sandbox;
  `permissions.blockReadsOutsideWorkingDirectories: true` confines file tools; `WebFetch(domain:…)`
  allow rules; `--restricted` (2.1.248+).
- **Codex CLI** (V, `codex-rs/sandboxing/.../seatbelt.rs`): deny-default base modelled on
  Chromium's, writable roots with `.git`/`.codex` carve-outs, network fail-closed unless a proxy
  variant; modes read-only / workspace-write / full. **Gemini CLI** (V): six Seatbelt profiles;
  `permissive-proxied` = deny default, write the target dir and caches, outbound only to
  `localhost:8877`, explicit denies for Docker sockets and credential files. **Cursor** (V,
  blog): rejected App Sandbox, containers and VMs; chose Seatbelt; blocked operations are named
  in the tool result so the agent escalates rather than retries.
- Not practical now (V): Apple `container` (macOS 26, admin install, Linux guests),
  microsandbox (beta, `curl | sh`), Docker Sandboxes (sign-in), OpenHands (Docker); firejail,
  bubblewrap, nsjail are Linux only.
- What goes wrong (V): an allow-default profile escaped through devfs and a fake .app
  (Antigravity); a README prompt injection plus a weak prefix allowlist exfiltrated env vars
  (Gemini CLI, fixed); a SOCKS5 null-byte allowlist bypass (Claude Code, fixed ~2.1.88); the
  docs themselves name `allowWrite` to `$PATH` or rc files, broad domains and `excludedCommands`
  as escape paths. Lesson: deny-default only, narrow hostnames, nothing excluded.

## 2. Surfaces an agent declares and a host renders

- **Contracts** (V): A2UI (Google, Apache-2.0, v0.9 preview): a flat list of components by id,
  a data model, and a client-held catalog of pre-approved components; weak set for data apps (no
  table or map in the base catalog). json-render (Vercel Labs, Apache-2.0, 18.6k stars, no
  tagged release): `defineCatalog` with typed props, spec `{root, elements}`, `$state/$item`
  bindings, progressive render, React/PDF renderers. MCP Apps / MCP-UI and the OpenAI Apps SDK
  (converged): a tool returns a `ui://` resource of full HTML rendered in a sandboxed iframe:
  embed-an-app, every module ships its own UI. Adaptive Cards: card-sized, no data binding.
- **Data-app frameworks** (V): Evidence (MIT core; Markdown + SQL → static pages; a map
  component with GeoJSON layers; DuckDB-backed); Rill (Apache-2.0; "BI-as-code" YAML + SQL over
  DuckDB, local; no maps or forms); Observable Framework (ISC; static site, data loaders,
  DuckDB-wasm); Datasette (Apache-2.0; SQLite → tables with facets, JSON API, CSV export,
  declarative `metadata.yaml`, `datasette-cluster-map` for lat/lng columns); marimo, Streamlit,
  Gradio, Panel (code-defined; a Python server per module; Panel's `Param` is the model for
  parameters with ranges and help). Table-over-DB products (NocoDB, Teable, Baserow) and
  internal-tool builders (Appsmith, ToolJet, Budibase) are servers; only ToolJet's "agent builds
  against the component contract" idea transfers.
- **Maps offline** (V): MapLibre GL JS (BSD-3) with PMTiles over range requests (a Tauri
  protocol must honour `Range`); OpenFreeMap styles and planet extracts, no keys; deck.gl for
  very large layers; DuckDB spatial `ST_AsGeoJSON` to feed layers.
- **Reports and exports** (V): no OSS "evidence-grade report" schema exists; Typst
  (Apache-2.0) for PDF, Pandoc writes Typst, WeasyPrint needs Pango. CSV and openpyxl are easy.

## 3. The data layer

- **DuckDB 1.5.6** (V, run here): spatial, httpfs and h3 install in 2.8 s; extensions cache per
  exact version under `~/.duckdb/extensions/`, offline install from a directory possible (so a
  shipped app must carry the extension files for its pinned version). GeoParquet read/write;
  a dedicated spatial join (58 M points × 310 polygons in about 29 s); 54 GDAL vector drivers.
  **Pitfall found by test:** `ST_Read` over a URL fails (no network GDAL); the working path for
  ArcGIS REST is `f=geojson` → `read_json(url)` → `unnest` → `ST_GeomFromGeoJSON`, with
  pagination (`resultOffset`, `exceededTransferLimit`, `maxRecordCount` 1000–2000) by the caller.
  Overture over anonymous S3 with bbox pushdown: 19k places in 5.8 s. Memory: 80% of RAM by
  default, spills except `list()`, `string_agg()`, `PIVOT`. GeoPandas fine as a consumer;
  SpatiaLite and cenpy avoided.
- **Pipelines and lineage** (V): Apache Hamilton 1.90 (functions are DAG nodes; upstream and
  downstream of any column queryable; loaders and savers return metadata; an OpenLineage adapter
  with a file transport, no server). dbt-duckdb and SQLMesh are project frameworks with
  table/column lineage; Dagster (27 deps), Kedro (17 deps, telemetry), DVC (needs git) are
  heavy; Ploomber archived. Standards: Data Package v2 (`sources[]`, `licenses`, `created` per
  resource), W3C PROV (pip `prov`), ODCS data contracts with `datacontract test` on local
  DuckDB/Parquet.
- **Self-test** (V): pointblank 1.0 (MIT; chained validations, thresholds, YAML plans, HTML
  report with failing rows, a DuckDB extra, llms.txt) is the most agent-friendly; pandera good;
  Great Expectations (18 deps) and Soda Library (cloud keys) avoided; pytest asserts the floor.
- **Public-data access to reuse** (V): `census` 0.8.27 (ACS, needs a key), `pygris` 0.2.1
  (TIGER geometries), `overturemaps` 1.0.2 (anonymous S3, bbox pushdown), `esridump` 1.13
  (2023, but its four pagination strategies are what agents get wrong), OSMnx 2.1; the `arcgis`
  SDK avoided (pandas, dask, matplotlib). Community MCP servers for Census and ArcGIS exist;
  none official, none for state DOT traffic.
- Published patterns for agent-generated pipelines with per-value provenance on a laptop: none
  found (PROLIT rewrites scripts into PROV graphs, metrics paywalled; vendor claims unverified).

## 4. Long builds, design documents, milestones

- **Anthropic, "Effective harnesses for long-running agents"** (V): an initializer writes the
  feature list as JSON (chosen because the model tampers with it less than Markdown; "unacceptable
  to remove or edit tests"), a progress file and an initial commit; every later session reads
  the progress file, the list and the git log, runs a smoke check, then does one highest-priority
  unfinished feature, commits, updates progress. Failures that led there: one-shotting ran out
  of context mid-feature; later sessions "declared victory" early; features marked done after
  unit tests without end-to-end use; driving the app "as a human user" helped most.
- **Anthropic, "Harness design for long-running application development"** (Mar 2026, V):
  planner → generator → evaluator; the planner expands a sentence into a product spec (features,
  user stories, data model) and stays essential even with stronger models ("without it the
  generator under-scoped"); a "sprint contract" of what done means is agreed before coding; the
  evaluator drives the live app with Playwright with hard thresholds per criterion; "tuning a
  standalone evaluator to be skeptical is far more tractable" than self-review (solo Claude-as-QA
  found real issues then argued them down). A solo run looked plausible in 20 minutes with the
  core feature broken; the full harness took 6 hours.
- **OpenAI, long-horizon tasks with Codex** (V): four files, `prompt.md` (frozen spec),
  `plans.md` (milestones small enough for one loop, each with acceptance criteria and validation
  commands), `implement.md`, `documentation.md` (decision log); 25 hours, 30k lines, "real and
  testable", not production.
- **Spec-driven methods** (V): Spec Kit (constitution → spec with `[NEEDS CLARIFICATION]`
  markers → plan with research.md, data-model.md, contracts → tasks → implement; no enforced
  gate); OpenSpec (per-change proposal/specs/design/tasks, archived on completion); BMAD (fresh
  chat per run, intent gaps become open questions that block approval, three review lenses,
  `deferred-work.md`); Kiro (requirements/design/tasks with a pause per file); AGENTS.md; the
  Agent Skills spec (SKILL.md, progressive disclosure).
- **Ralph loop** (V): `while :; do cat PROMPT.md | claude; done`; the official plugin's
  `--max-iterations` is "the primary safety net"; critiques: one run burned 50 iterations needing
  a human decision at iteration 3; it "will cheerfully commit broken code and tell you it's done"
  without mechanical backpressure; wrong for judgement questions.
- **Verification evidence** (V): 75.8% of coding-agent trajectories with explicit status claims
  were false successes; LLM judges never exceed AUROC 0.65 (arXiv 2606.09863); a hard-coded
  verifier agreed with humans 113/120 against an LLM judge's 95/120 (R). No controlled study
  that browser-driving reduces false "done", but Anthropic, Replit and Lovable all assert it.
  Claude Code's own `/goal` (a separate small model judges the condition each turn; stalls stop
  the loop) and `/verify` (records a recipe to a skill).
- **Products for non-technical builders** (V): Replit (plan → ordered tasks → "Accept tasks /
  Revise plan"; App Testing clicks through in a real browser with a replayable video; "Begin
  take over" for logins), Lovable (plan mode with edit and approve; browser testing shown, never
  silent), Airtable Omni (confirms a plan first); no vendor publishes acceptance numbers.

## What this means for the design

1. The wall is Claude Code's own sandbox, driven by `--settings` JSON (works with Alpha's
   `--setting-sources ""`, verified), deny-default, writes only in the module's folder, network
   only to the hosts the design names, through Alpha's own journaling proxy; secrets and
   Alpha's world file denied; the whole run wrapped in `srt` for unattended builds; blocked
   operations named to the model and journaled. No Docker, no VMs. Re-read the sandbox docs at
   every pinned CLI bump.
2. Three artifacts with distinct jobs, as Anthropic and OpenAI both converged on: the agreed
   design document (frozen per milestone, open questions block approval), a machine-checked
   milestone list in JSON whose `passes` only an evaluator flips, an append-only progress and
   decision log. A fresh session per milestone from those three plus the git log and a smoke
   check; one milestone per session; commit per milestone.
3. Done is decided by a separate skeptical evaluator that runs the real pages, with scripted
   checks wherever a check can be coded (rows exist, a score within the benchmark range, a page
   renders), an LLM opinion last; never the builder's own word.
4. Own a small page contract (catalog-only, flat, data bindings, in the json-render/A2UI
   shape) with five kinds, table / map / report / settings / export, over declared SQL sources;
   render in Alpha's shell; Datasette-style facets and CSV; MapLibre + PMTiles + OpenFreeMap
   offline; report rows with value, source, method, confidence; Panel-style parameters; Typst
   for PDF. Never iframes per module, never a Python server per module.
5. The data layer: Python + pinned DuckDB with its extensions shipped, GeoParquet per layer,
   plain functions wired by Hamilton, `provenance.json` per layer in Data Package shape plus
   source and method columns on derived values, pointblank plans and a `selftest.py`; reuse
   `census`, `pygris`, `overturemaps`, `esridump`'s pagination, OSMnx.
