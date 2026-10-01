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

# The desktop app: the workspace and the companion, hosting the core.
app-web:
    export PATH=/opt/homebrew/opt/node@24/bin:$PATH && cd desktop && pnpm dev

app-dev:
    export PATH=/opt/homebrew/opt/node@24/bin:$HOME/.cargo/bin:$PATH && cd desktop && pnpm tauri dev

app:
    export PATH=/opt/homebrew/opt/node@24/bin:$HOME/.cargo/bin:$PATH && cd desktop && pnpm install && pnpm tauri build --debug --bundles app && open src-tauri/target/debug/bundle/macos/Alpha.app

test-desktop:
    export PATH=/opt/homebrew/opt/node@24/bin:$PATH && cd desktop && pnpm typecheck && pnpm test
