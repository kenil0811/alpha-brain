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

serve:
    uv run alpha serve

# The journey suite: real journeys on a copy of the app's world, judged and timed; the report
# lands in docs/journeys/. `just journeys branded_food` runs one.
journeys *ARGS:
    caffeinate -i uv run alpha journeys {{ARGS}}

# The desktop app: the workspace and the companion, hosting the core. Builds are signed with
# the local "Alpha Local Signing" certificate so macOS keeps Alpha's permissions across rebuilds;
# /usr/bin comes first because a python.org xattr without -r shadows the system one.
app-web:
    export PATH=/opt/homebrew/opt/node@24/bin:$PATH && cd desktop && pnpm dev

app-dev:
    export PATH=/opt/homebrew/opt/node@24/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH && cd desktop && pnpm tauri dev

app:
    export PATH=/opt/homebrew/opt/node@24/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH && cd desktop && pnpm install && pnpm tauri build --debug --bundles app && open src-tauri/target/debug/bundle/macos/Alpha.app

test-desktop:
    export PATH=/opt/homebrew/opt/node@24/bin:$PATH && cd desktop && pnpm typecheck && pnpm test

# The numbers STATE.md states, measured: never carried from memory.
stats:
    @echo "core tests:    $(cd core && uv run pytest -q 2>&1 | tail -1)"
    @echo "desktop tests: $(grep -rc '^\s*it(' desktop/src --include='*.test.tsx' | awk -F: '{s+=$2} END {print s}') in $(find desktop/src -name '*.test.tsx' | wc -l | tr -d ' ') file(s)"
    @echo "tools:         $(grep -c '@tool' core/alpha/mcp/tools.py)"
    @echo "journeys:      $(ls journeys/*.yaml | wc -l | tr -d ' ') defined; latest report $(ls -t docs/journeys/*.md | head -1 | xargs basename): $(ls -t docs/journeys/*.md | head -1 | xargs sed -n 3p | cut -c1-20)"
    @echo "commits:       $(git log --oneline | wc -l | tr -d ' ') total, $(git log --since=2026-10-01 --oneline | wc -l | tr -d ' ') since 1 Oct 2026"
    @echo "lines:         core $(find core/alpha -name '*.py' | xargs cat | wc -l | tr -d ' ') py, tests $(find core/tests -name '*.py' | xargs cat | wc -l | tr -d ' ') py, desktop $(find desktop/src -name '*.ts' -o -name '*.tsx' | xargs cat | wc -l | tr -d ' ') ts/tsx"
    @echo "lint:          $(uv run ruff check . 2>&1 | tail -1); $(uv run mypy 2>&1 | tail -1)"
