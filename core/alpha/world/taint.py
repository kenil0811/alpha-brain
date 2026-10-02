"""The taint rule: once a run has read private or third-party material, nothing new leaves.

Claude Code's own WebSearch and WebFetch run only through `gate`, a PreToolUse hook the turn
runner installs (`python -m alpha.world.taint`): it reads the same taint state and refuses
when the run is tainted, and refuses a fetch of an address on this Mac or the local network.
It fails closed: the hook command is `... || exit 2`, so a gate that cannot run blocks the tool.

A model run always holds some of the person's own words (the pre-pack: who they are, their goals,
the recent conversation). That baseline is allowed out in a web search or fetch only because it
is the person's and nothing in it was written by someone else. Once a run has read material
beyond it (the list below), a search query or an address could carry it off, and text planted
in it could ask for exactly that. From then on, for the rest of that run and of its thread
(a thread resumes the same model session, so what it read stays in context):

- WebSearch and WebFetch refuse, with a one-line reason;
- pages open only on sites the run already read, sites the person signed in to in Alpha's
  browser, or sites named in the turn's own words (the person's sentence, an automation's
  procedure).

What taints (`READS`, plus the pre-pack and page reads below):
- searching or listing what Alpha holds: `search`, `journal_recent`, `journal_read`,
  `records_query`;
- documents: `document_read`, `documents_list`;
- the calendar: `calendar_events`;
- people, facts and notes: `entities_find`, `entity_read`, `facts_get`, `notes_list`,
  `note_read`;
- a page read through the person's sign-in (`page_read`, `page_script`, `page_to_table`,
  `reader_save`, `reader_run`), but not a public page;
- a pre-pack that carries today's calendar, records, documents or what Alpha saw in a source
  (`prepack.build_with_taint`), or an earlier reply in the conversation from a tainted run.

What does not: counts and shapes (`collections_list`, `records_aggregate`, `modules_list`,
`readers_list`, ...), writes inside Alpha, and public web pages. A public page is untrusted, and
could steer a later fetch to carry the baseline out: that is the known ceiling (upgrade path:
research in a separate run with no pre-pack).
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import socket
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from alpha.world.store import Store, now

READS = {
    "search": "searched what Alpha holds",
    "journal_recent": "read the journal",
    "journal_read": "read the journal",
    "records_query": "read the person's records",
    "document_read": "read the person's documents",
    "documents_list": "read the person's documents",
    "calendar_events": "read the calendar",
    "entities_find": "read what Alpha knows about people",
    "entity_read": "read what Alpha knows about people",
    "facts_get": "read what Alpha knows about people",
    "notes_list": "read Alpha's notes",
    "note_read": "read Alpha's notes",
}
SIGNED_IN_PAGE = "read a page through the person's sign-in"


def mark(store: Store, turn: str | None, thread: str | None, reason: str) -> None:
    if not turn:
        return
    with store.tx() as db:
        db.execute("INSERT OR IGNORE INTO taints (turn, thread, reason, at) VALUES (?,?,?,?)",
                   (turn, thread, reason, now()))


def reason(store: Store, turn: str | None, thread: str | None) -> str | None:
    """Why this run (or its thread) is tainted, or None."""
    row = store.one(
        "SELECT reason FROM taints WHERE turn = ? OR (? IS NOT NULL AND thread = ?)"
        " ORDER BY at LIMIT 1", (turn or "", thread, thread))
    return str(row["reason"]) if row else None


def local_address(url: str) -> bool:
    """Whether an address is on this Mac or the local network (or can't be resolved)."""
    host = urlparse(url).hostname
    if not host:
        return True
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False  # it can't be reached at all, so it can't reach anything local
    return any(not ipaddress.ip_address(str(info[4][0]).split("%")[0]).is_global
               for info in infos)


def gate(store: Store, turn: str | None, thread: str | None,
         call: dict[str, Any]) -> str | None:
    """Why a WebSearch or WebFetch call is refused, or None to let it run."""
    tool = call.get("tool_name")
    why = reason(store, turn, thread)
    if why:
        return (f"Web search and fetch are off for the rest of this run: it already {why}, and "
                "a query or an address could carry that out.")
    if tool == "WebFetch" and local_address(str((call.get("tool_input") or {}).get("url", ""))):
        return "Alpha doesn't fetch addresses on this Mac or the local network."
    return None


def main() -> None:
    """The hook: the call as JSON on stdin; exit 0 lets it run, exit 2 refuses (stderr says
    why)."""
    p = argparse.ArgumentParser()
    p.add_argument("--world", required=True)
    p.add_argument("--turn", required=True)
    p.add_argument("--thread", default="")
    args = p.parse_args()
    call = json.loads(sys.stdin.read() or "{}")
    store = Store(Path(args.world))
    try:
        refused = gate(store, args.turn, args.thread or None, call)
    finally:
        store.close()
    if refused:
        print(refused, file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
