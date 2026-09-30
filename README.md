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

- `docs/design/alpha-second-brain-design.md` — the agreed design: principles, the world model,
  capabilities, the agent loop, standing things, trust, workspace, model route, decisions.
- `docs/design/build-plan.md` — the engineering plan: verified toolchain facts, the first slice
  in detail (world store, MCP server, companion turn), what follows, what to port.
- `docs/design/research/` — the four research reports behind the design.
- `core/` — the Python core (`alpha` package): world store, pre-pack, runtime, MCP server, CLI.
- `connectors/` — built-in connectors (browser, files, calendar; later).
- `desktop/` — the Tauri + React app (later; ported from the current shell).

## Running

```
just setup      # uv sync (Python 3.13.9, uv 0.12.17)
just test
just ask "log two boiled eggs"
```

The model route is the Claude Code CLI on the owner's subscription; `claude` must be logged in
from the default config home and `USER` must be in the environment.
