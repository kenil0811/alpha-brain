# AGENTS.md

Alpha (AB) is a second-brain agent for one person on their Mac. Read `README.md` first.

## Where things are

- `core/` — the Python core (`alpha` package): world store (`world/`), runtime and turns
  (`runtime/`), the HTTP API the app uses (`api/server.py`), MCP tools (`mcp/`), CLI.
- `desktop/` — the Tauri 2 + React 19 app. `src/App.tsx` is the shell; `src/shell/` the rail,
  Home, Activity, Intelligence; `src/modules/` a project's page; `src/assistant/` Chief of Staff;
  `src/avatar/` the companion; `src/ui/` shared primitives; `src/styles/` tokens and app CSS;
  `src-tauri/` the native host.
- `docs/design/` — the design (`alpha-second-brain-design.md`), plan and governance.
- `docs/development/` — `ui-rules.md` and the Alpha UI port inventory.
- `bugs.md` — bugs found, open and fixed.

## Run and test

```
just setup                                      # uv sync
uv run pytest -q                                # core tests
uv run ruff check . && uv run mypy              # lint and types (from the repo root)
ALPHA_HOME=/tmp/ab-home uv run alpha serve --port 53901   # a core on scratch data
cd desktop
pnpm install
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/vitest run
VITE_ALPHA_CORE_URL=http://127.0.0.1:53901 ./node_modules/.bin/vite --port 1431
```

Node 24 is at `/opt/homebrew/opt/node@24/bin`. Never point a dev core at the person's real data
folder.

## UI rules

UI rules: `docs/development/ui-rules.md` — follow them. Run `desktop/tools/layout-check.js` at
1100x760 and 1440x900 after any layout change; it must return `[]`.
