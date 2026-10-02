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

# The one gate, for people and CI alike: everything above that can run without a screen.
verify: lint test test-desktop
    export PATH=/opt/homebrew/opt/node@24/bin:$PATH && cd connectors/browser && npm test
    export PATH=$HOME/.cargo/bin:/usr/bin:/bin:$PATH && cd desktop/src-tauri && cargo check
