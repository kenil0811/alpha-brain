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
