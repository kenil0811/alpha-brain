# Alpha, the second brain. `just setup` once, then `just test`, `just ask "..."`.
set shell := ["zsh", "-cu"]

setup:
    uv sync

test:
    uv run pytest -q

lint:
    uv run ruff check . && uv run mypy

ask *ARGS:
    uv run alpha ask {{ARGS}}

journal *ARGS:
    uv run alpha journal {{ARGS}}

# How long the last turns took, measured from the journal (wall, the model's time, steps).
turns *ARGS:
    uv run alpha turns {{ARGS}}

serve:
    uv run alpha serve

# The journey suite: real journeys on a copy of the app's world, judged and timed; the report
# lands in docs/journeys/. `just journeys branded_food` runs one.
journeys *ARGS:
    caffeinate -i uv run alpha journeys {{ARGS}}

# The desktop acceptance check: every page of the window, at the window's own sizes, against a
# core on a copy of the world; the report lands in docs/checks/, screenshots in desktop/.check/.
# `just check-desktop intelligence settings` checks the pages under those addresses only.
check-desktop *ARGS:
    caffeinate -i uv run alpha check-desktop {{ARGS}}

# The desktop app: the workspace and the companion, hosting the core. Builds are signed with
# the local "Alpha Local Signing" certificate so macOS keeps Alpha's permissions across rebuilds;
# /usr/bin comes first because a python.org xattr without -r shadows the system one.
app-web:
    export PATH=/opt/homebrew/opt/node@24/bin:$PATH && cd desktop && pnpm dev

app-dev:
    export PATH=/opt/homebrew/opt/node@24/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH && cd desktop && pnpm tauri dev

app:
    export PATH=/opt/homebrew/opt/node@24/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH && cd desktop && pnpm install && pnpm tauri build --debug --bundles app && open src-tauri/target/debug/bundle/macos/Alpha.app

# Restart the running app on the current build: the window and its core together (killing the
# window alone leaves the core running with its scheduler on the live world, found 3 Oct).
app-restart:
    pkill -f "Alpha.app/Contents/MacOS/alpha-desktop" || true; pkill -f "alpha.cli serve" || true; sleep 2; open desktop/src-tauri/target/debug/bundle/macos/Alpha.app

test-desktop:
    export PATH=/opt/homebrew/opt/node@24/bin:$PATH && cd desktop && pnpm typecheck && pnpm test

# The one gate, for people and CI alike: everything above that can run without a screen.
verify: lint test test-desktop
    export PATH=/opt/homebrew/opt/node@24/bin:$PATH && cd connectors/browser && npm test
    export PATH=$HOME/.cargo/bin:/usr/bin:/bin:$PATH && cd desktop/src-tauri && cargo check
    just layout

# Every page, seeded, at 1100x760 and 1440x900 through tools/layout-check.js (needs Chrome or Edge).
layout:
    export PATH=/opt/homebrew/opt/node@24/bin:$PATH && cd desktop && node tools/layout-run.mjs
# The numbers STATE.md states, measured: never carried from memory.
stats:
    @echo "core tests:    $(cd core && uv run pytest -q 2>&1 | tail -1)"
    @echo "desktop tests: $(grep -rhoE '^\s*it\(' desktop/src desktop/scripts --include='*.test.ts' --include='*.test.tsx' | wc -l | tr -d ' ') in $(find desktop/src desktop/scripts -name '*.test.ts' -o -name '*.test.tsx' | wc -l | tr -d ' ') file(s)"
    @echo "tools:         $(cat core/alpha/mcp/tools/*.py | grep -c '@tool')"
    @echo "journeys:      $(ls journeys/*.yaml | wc -l | tr -d ' ') defined; latest report $(ls -t docs/journeys/*.md | head -1 | xargs basename): $(ls -t docs/journeys/*.md | head -1 | xargs sed -n 3p | cut -c1-20)"
    @echo "desktop check: latest report $(ls -t docs/checks/*.md 2>/dev/null | head -1 | xargs -n1 basename 2>/dev/null): $(ls -t docs/checks/*.md 2>/dev/null | head -1 | xargs -n1 sed -n 3p 2>/dev/null | cut -c1-60)"
    @echo "commits:       $(git log --oneline | wc -l | tr -d ' ') total, $(git log --since="2026-10-01 00:00" --oneline | wc -l | tr -d ' ') since 1 Oct 2026"
    @echo "lines:         core $(find core/alpha -name '*.py' | xargs cat | wc -l | tr -d ' ') py, tests $(find core/tests -name '*.py' | xargs cat | wc -l | tr -d ' ') py, desktop $(find desktop/src -name '*.ts' -o -name '*.tsx' | xargs cat | wc -l | tr -d ' ') ts/tsx"
    @echo "lint:          $(uv run ruff check . 2>&1 | tail -1); $(uv run mypy 2>&1 | tail -1)"
