"""`alpha`: talk to Alpha and look at what it holds, from a terminal.

    alpha ask "log two boiled eggs" [--module Food] [--thread t_…]
    alpha journal [--limit 20] [--module Food]
    alpha search "eggs"
    alpha tables
    alpha show food_log [--limit 20]
    alpha notes
    alpha prepack "how much protein today" [--module Food]
    alpha context j_turn            (what the model saw for that turn)
    alpha check [j_turn] [--no-repair]   (a reply against an independent answer)
    alpha remove-module Food        (the module and everything made for it; history stays)
    alpha clear-conversation        (the stream's turns; the only physical journal delete)
    alpha connect folder|site|calendar [target]
    alpha serve [--port N] [--no-background]   (the HTTP API the app uses; the scheduler runs here)
    alpha journeys [names…] [--world path] [--keep] [--list]   (the journey suite, on a copy)
    alpha mcp                       (the MCP server the model talks to)

`alpha ask` runs one turn only, on the model chosen in Settings -> Models: the second opinion
and the build kick live in `alpha serve`. ALPHA_HOME picks the data directory.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from alpha.context import prepack
from alpha.runtime import turn
from alpha.world.store import Problem
from alpha.world.world import World


def _table(rows: list[dict[str, Any]], columns: list[str]) -> str:
    if not rows:
        return "(nothing)"
    cells = [[str(r.get(c, "") if r.get(c) is not None else "") for c in columns] for r in rows]
    widths = [min(40, max(len(c), *(len(row[i]) for row in cells))) for i, c in enumerate(columns)]
    line = "  ".join(c.ljust(w) for c, w in zip(columns, widths, strict=True))
    out = [line, "  ".join("-" * w for w in widths)]
    for row in cells:
        out.append("  ".join(v[:w].ljust(w) for v, w in zip(row, widths, strict=True)))
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="alpha", description="Alpha, the second brain.")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("ask", help="say something to Alpha")
    p.add_argument("text", nargs="+")
    p.add_argument("--module")
    p.add_argument("--thread")
    p = sub.add_parser("journal", help="what happened, newest last")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--module")
    p = sub.add_parser("search", help="search the journal and every table")
    p.add_argument("query", nargs="+")
    sub.add_parser("tables", help="every table and its module")
    p = sub.add_parser("show", help="the records of one table")
    p.add_argument("collection")
    p.add_argument("--limit", type=int, default=20)
    sub.add_parser("notes", help="Alpha's notes")
    p = sub.add_parser("remove-module", help="delete a module and everything that belongs to it")
    p.add_argument("module")
    sub.add_parser("clear-conversation", help="delete the conversation (activity stays)")
    p = sub.add_parser("context", help="print what the model was given for a turn")
    p.add_argument("turn", help="the turn's journal id (its 'said' entry)")
    p = sub.add_parser("check", help="check a turn's reply against an independent answer")
    p.add_argument("turn", nargs="?", help="the turn's journal id; default: the last one")
    p.add_argument("--no-repair", action="store_true", help="only judge; don't let Alpha fix")
    p = sub.add_parser("prepack", help="print what the model would see first")
    p.add_argument("text", nargs="+")
    p.add_argument("--module")
    sub.add_parser("mcp", help="run the MCP server (stdio)")
    p = sub.add_parser("serve", help="run the core's HTTP API for the app")
    p.add_argument("--port", type=int, default=int(os.environ.get("ALPHA_PORT", "53900")))
    p.add_argument("--no-background", action="store_true",
                   help="no scheduler, second opinion or noticing: a core for checks only")
    p = sub.add_parser("journeys", help="run the journey suite on a copy of the world")
    p.add_argument("names", nargs="*", help="journeys to run (default: all)")
    p.add_argument("--world", help="the world file to copy (default: the app's)")
    p.add_argument("--keep", action="store_true", help="keep the scratch copy afterwards")
    p.add_argument("--list", action="store_true", help="list the journeys and stop")
    p = sub.add_parser("check-desktop",
                       help="open every page of the window on a copy of the world and report")
    p.add_argument("pages", nargs="*", help="address prefixes to check (default: every page)")
    p.add_argument("--world", help="the world file to copy (default: the app's)")
    p.add_argument("--keep", action="store_true", help="keep the scratch copy afterwards")
    p = sub.add_parser("connect", help="connect a folder, a site or the calendar")
    p.add_argument("what", choices=["folder", "site", "calendar"])
    p.add_argument("target", nargs="?")
    args = parser.parse_args(argv)

    if args.command == "mcp":
        from alpha.mcp.server import main as mcp_main

        mcp_main()
        return 0
    if args.command == "serve":
        from alpha.api.server import serve

        serve(args.port, background=not args.no_background)
        return 0
    if args.command == "journeys":
        from alpha.journeys import suite

        if args.list:
            for j in suite.load():
                print(f"{j['name']:<18} {j.get('title', '')}")
            return 0
        try:
            failures, path = suite.run_suite(args.names or None,
                                             world_path=Path(args.world) if args.world else None,
                                             keep=args.keep)
        except Problem as e:
            print(str(e), file=sys.stderr)
            return 2
        print(path.read_text())
        print(f"Report: {path}", file=sys.stderr)
        return 1 if failures else 0
    if args.command == "check-desktop":
        from alpha.journeys import desktop

        try:
            failures, path = desktop.run_check(args.pages or None,
                                               world_path=Path(args.world) if args.world else None,
                                               keep=args.keep)
        except Problem as e:
            print(str(e), file=sys.stderr)
            return 2
        print(path.read_text())
        print(f"Report: {path}", file=sys.stderr)
        return 1 if failures else 0

    world = World()
    try:
        if args.command == "ask":
            # The same route the app uses: the chosen model and Alpha's own sign-in, never the
            # `claude` CLI's login (Alpha bugs #45).
            from alpha.models.accounts import Accounts
            from alpha.runtime.route import Router

            outcome = turn.ask(world, " ".join(args.text), module=args.module, thread=args.thread,
                               runner=Router(Accounts(world.store)))
            print(outcome.reply)
            r = outcome.result
            if r.duration_ms is not None:
                print(f"\n[{r.duration_ms / 1000:.1f} s · {r.num_turns} steps]", file=sys.stderr)
            return 0 if outcome.ok else 1
        if args.command == "journal":
            module = world.modules.get(args.module)["id"] if args.module else None
            for entry in world.journal.recent(args.limit, module=module):
                print(f"{entry['at'][5:16].replace('T', ' ')}  {entry['kind']:<8} {entry['text']}")
            return 0
        if args.command == "search":
            print(json.dumps(
                {"records": world.collections.search(" ".join(args.query)),
                 "journal": [{"at": entry["at"], "kind": entry["kind"],
                              "snippet": entry["snippet"]}
                             for entry in world.journal.search(" ".join(args.query))]},
                indent=2, ensure_ascii=False,
            ))
            return 0
        if args.command == "tables":
            names = {m["id"]: m["name"] for m in world.modules.all()}
            rows = [{**t, "module": names.get(t["module"], t["module"] or "")}
                    for t in world.collections.overview()]
            print(_table(rows, ["name", "title", "module", "records"]))
            return 0
        if args.command == "show":
            desc = world.collections.describe(args.collection)
            rows = world.collections.query(args.collection, limit=args.limit)
            cols = [f["name"] for f in desc["fields"]] + ["created_at"]
            print(f"{desc['title']} ({desc['records']} records)\n")
            print(_table(rows, cols))
            return 0
        if args.command == "notes":
            for n in world.knowledge.notes():
                print(f"## [{n['scope']}] {n['title']}\n{n['body']}\n")
            return 0
        if args.command == "connect":
            from alpha.connectors.browser import Browser
            from alpha.connectors.calendar import Calendar
            from alpha.connectors.files import Files

            if args.what == "calendar":
                result: Any = Calendar(world).connect()
            elif not args.target:
                print(f"Say which {args.what}.", file=sys.stderr)
                return 2
            elif args.what == "folder":
                files = Files(world)
                result = {**files.watch(args.target), "sync": files.sync(args.target)}
            else:
                result = Browser(world).start_signin(args.target)
                print("A window is open: sign in there, then close it.", file=sys.stderr)
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0
        if args.command == "context":
            kept = world.journal.context(args.turn)
            if kept is None:
                print(f"No context was kept for {args.turn}.")
                return 1
            print(f"{kept['at']} · rules {kept['rules']}\n\n{kept['context']}")
            return 0
        if args.command == "remove-module":
            from alpha.world.purge import remove_module

            print(json.dumps(remove_module(world, args.module)))
            return 0
        if args.command == "clear-conversation":
            from alpha.world.purge import clear_conversation

            print(json.dumps(clear_conversation(world)))
            return 0
        if args.command == "prepack":
            print(prepack.build(world, " ".join(args.text), module=args.module))
            return 0
        if args.command == "check":
            from alpha.runtime import check

            turn_id = args.turn
            if not turn_id:
                last = world.journal.recent(1, stream=True, kinds=["said"])
                if not last:
                    print("Nothing has been said yet.", file=sys.stderr)
                    return 1
                turn_id = last[0]["id"]
            result = check.check(world, turn_id, repair=not args.no_repair)
            if not result["checked"]:
                print(result["why"], file=sys.stderr)
                return 1
            print(check.words(result))
            print(f"\nIndependent answer:\n{result['independent']}")
            if result.get("repaired"):
                print(f"\nAlpha: {result['repaired']}")
            return 0 if result["agree"] else 1
    except Problem as e:
        print(str(e), file=sys.stderr)
        return 2
    finally:
        world.close()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
