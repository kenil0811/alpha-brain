"""The MCP server that hands the world to the model: `python -m alpha.mcp.server`.

Started by the Claude Code CLI for each turn (stdio). The world file comes from `ALPHA_WORLD`;
`ALPHA_TURN`, `ALPHA_THREAD` and `ALPHA_MODULE` tie what the tools record to the turn that ran
them.
"""

from __future__ import annotations

import logging

from fastmcp import FastMCP

from alpha.mcp.tools import Tools
from alpha.world.world import World

INSTRUCTIONS = (
    "Alpha's world: the person's tables, journal, notes, goals, facts, people and companies, "
    "modules and threads. Search before answering about the past; records carry provenance."
)


def build_server(world: World | None = None) -> FastMCP:
    server = FastMCP("alpha", instructions=INSTRUCTIONS)
    for fn in Tools(world or World()).all():
        server.tool(fn)
    return server


def main() -> None:
    logging.basicConfig(level=logging.WARNING)
    build_server().run(transport="stdio", show_banner=False)


if __name__ == "__main__":
    main()
