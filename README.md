# Alpha

Alpha is an agentic second brain: an agent that lives on a person's Mac, learns their world from
what they say and what it can reach, holds that world in a store it owns, acts for them through
connectors, and becomes more useful the longer it runs. The floating companion is the product;
the workspace window is where the person works with their tables, flows and connected apps and
checks what Alpha did.

This repository replaces `../alpha-platform` (the module-builder platform, kept as a reference and
as the running demo until this one overtakes it). Nothing from its build pipeline is carried over;
a short list of pieces is ported deliberately (see `docs/design/build-plan.md`).

## Where things are

- `docs/STATE.md` — the current state, one page, rewritten every session: what is built, what
  runs for real, what is wrong, what is pending in order, the measured numbers. Read it first.
- `docs/log/` — the dated history, one file per entry, verbatim (what each session built, ran
  and found; the 3 Oct checkpoint); `docs/log/README.md` lists them.
- `docs/design/alpha-second-brain-design.md` — the agreed design, intent only: principles, the
  world model, capabilities, the agent loop, standing things, trust, workspace, model route,
  decisions (Q1–Q26); a status box (built / differs / not built) under each section.
- `docs/design/build-plan.md` — what does not change by the day: verified toolchain facts, the
  first slice's shape, what to port, open engineering questions; a map from the old §4.N
  section numbers to the log files.
- `docs/design/research/` — the five research reports behind the design.
- `core/alpha/` — the Python core: `world/` (one SQLite file per person: journal, collections,
  records, entities, facts, notes, goals, modules, threads, plans, sources, skills (readers, procedures, pipelines),
  automations), `context/` (the deterministic pre-pack and module summaries), `runtime/` (the
  `claude -p` runs, the turn, builds, pipelines, the scheduler, the second opinion), `journeys/`
  (the suite that runs `../journeys/*.yaml` on a copy of the world), `mcp/` (the
  world as tools for the model), `api/` (the loopback HTTP API the app uses), `connectors/`
  (the Python side of the hands), `cli.py`.
- `connectors/` — the built-in hands as Agent Skills directories: `browser/` (Playwright driver: reads are read-only by mechanism; acting, downloads and uploads run only inside an approved action), `files/`, `calendar/`; each has a `connector.yaml` and a `SKILL.md`.
- `desktop/` — the Tauri 2 + React app: the workspace (rail, Home, modules with derived table
  pages, People & Companies, Intelligence, Activity, Settings), the 380px conversation panel, and the companion
  window. The app starts the core from this repository's `.venv`.
- `journeys/` — the real journeys the suite runs after a change (`just journeys`); reports land in
  `docs/journeys/`.
- `core/tests/` — the core's tests; `desktop/src/**/*.test.tsx` — the app's.

## Running

```
just setup          # uv sync (Python 3.13.9, uv 0.12.17)
just test           # core tests (pytest)
just lint           # ruff + mypy strict
just ask "log two boiled eggs"
just serve          # the core's HTTP API on a loopback port
just app            # build the signed debug app and open it (needs the node@24 keg and Rust)
just app-dev        # the app with Vite hot reload
just test-desktop   # typecheck + vitest
just journeys       # the journey suite on a copy of the app's world (uses the subscription)
just stats          # the measured numbers STATE.md quotes
```

The model route is the Claude Code CLI on the owner's subscription; `claude` must be logged in
from the default config home and `USER` must be in the environment. The app keeps its world in
`~/Library/Application Support/com.alpha.brain` (the world file, the browser profiles, Alpha's own
`files/<module>` for what it fetched or was given, `exports/`, `actions/` screenshots); the CLI on its own defaults to
`~/Library/Application Support/Alpha Brain` unless `ALPHA_HOME` names a directory (tests and
acceptance runs use a scratch one so the owner's world stays untouched). Builds are
signed with the local "Alpha Local Signing" certificate so macOS keeps the app's permissions
across rebuilds; see `docs/log/2026-10-01-4-1-slice-2-as-built-1.md`.
