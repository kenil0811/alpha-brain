# The slice 1 spikes (17 October 2026)

Five scripts against the Claude Agent SDK 0.2.168 (bundled Claude Code 2.1.301), run on Kenil's
Mac on his subscription, no API key, on Haiku. Their answers are in
`../../2026-10-17-harness-slice1-spikes.md`. To rerun on an SDK bump:

    uv venv .venv --python 3.13.9 && VIRTUAL_ENV=.venv uv pip install "claude-agent-sdk==<version>"
    .venv/bin/python -I spike1_auth.py      # and so on

`common.py` builds the options the way Alpha's runs will: no `CLAUDE_CONFIG_DIR`, `USER` set,
`setting_sources=[]`, `strict_mcp_config=True`, `permission_mode="dontAsk"` unless a spike says
otherwise. Spike 1 is meant to be run in a bare environment
(`env -i HOME=$HOME USER=$USER PATH=/usr/bin:/bin ...`). Each spike costs a few cents.
