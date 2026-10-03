"""The map of Alpha's own work (`docs/design/knowledge-graph-proposal.md`, option C, chosen by
Kenil on 3 Oct 2026): what connects to what, and how Alpha knows it.

Nodes are the things the Intelligence section lists: modules, tables, skills (read, act, run),
automations, the sources a module reads from, and connections (a signed-in site, a watched
folder, the calendar). Edges are the world's own kinds of relation, each with its source in
the world: a run skill's steps say which reader feeds which table and in what order; a source
names its reader; a browser sign-in names the sites it covers; a folder's documents name the
module they went to. Nothing is stored: the map is computed from the tables on each ask, so
it is never stale and never a second truth. The window gives the nodes their addresses and
the edges their words; the core gives the facts.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from alpha.connectors.base import Connections
from alpha.connectors.browser import signin_sites
from alpha.world.store import loads, now
from alpha.world.world import World

RUNS_WINDOW_DAYS = 30


def _skill_runs(world: World) -> dict[str, dict[str, int]]:
    """How often each skill ran and failed in the last 30 days, from the journal (the entries
    that name a reader, a procedure or a skill in their data)."""
    cutoff = (datetime.now(UTC) - timedelta(days=RUNS_WINDOW_DAYS)).isoformat()
    counts: dict[str, dict[str, int]] = {}
    for row in world.store.all(
            "SELECT kind, data FROM journal WHERE kind IN ('did', 'failed') AND at > ?"
            " AND deleted_at IS NULL", (cutoff,)):
        data = loads(row["data"], {})
        for key in ("reader", "procedure", "skill"):
            name = data.get(key)
            if isinstance(name, str) and name:
                bucket = counts.setdefault(name, {"runs": 0, "failed": 0})
                bucket["runs"] += 1
                if row["kind"] == "failed":
                    bucket["failed"] += 1
    return counts


def work_graph(world: World, automations: list[dict[str, Any]]) -> dict[str, Any]:
    """The nodes and edges of the map of work. `automations` are the scheduler's views (they
    carry which run skill each automation runs), handed in so this module needs no scheduler."""
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    known: set[str] = set()

    def node(nid: str, kind: str, title: str, **more: Any) -> None:
        known.add(nid)
        nodes.append({"id": nid, "kind": kind, "title": title,
                      **{k: v for k, v in more.items() if v is not None}})

    def edge(src: str, dst: str, kind: str, **more: Any) -> None:
        if src in known and dst in known:
            edges.append({"from": src, "to": dst, "kind": kind,
                          **{k: v for k, v in more.items() if v is not None}})

    for m in world.modules.all():
        node(f"module:{m['id']}", "module", m["name"], subtitle=m.get("goal"), module=m["id"])

    for t in world.collections.overview():
        node(f"table:{t['name']}", "table", t["title"], subtitle=f"{t['records']:,} rows",
             module=t["module"], rows=t["records"])
        if t["module"]:
            edge(f"table:{t['name']}", f"module:{t['module']}", "in")

    runs = _skill_runs(world)
    skills = world.skills.all()
    for sk in skills:
        count = runs.get(sk["name"], {"runs": 0, "failed": 0})
        state = "broken" if sk["health"] == "broken" else sk["health"]
        node(f"skill:{sk['name']}", "skill", sk["name"].replace("_", " "), role=sk["kind"],
             subtitle=sk.get("site") or (f"{len(sk.get('steps') or [])} steps"
                                         if sk["kind"] == "run" else None),
             state=state, detail=sk.get("last_problem"), module=sk.get("module"),
             runs=count["runs"], failed=count["failed"], name=sk["name"],
             description=sk.get("description"))
    for sk in skills:
        sid = f"skill:{sk['name']}"
        if sk.get("module"):
            edge(sid, f"module:{sk['module']}", "in")
        if sk["kind"] != "run":
            continue
        fed: set[tuple[str, str]] = set()
        for i, step in enumerate(sk.get("steps") or [], start=1):
            if not isinstance(step, dict):
                continue
            if step.get("read"):
                edge(sid, f"skill:{step['read']}", "runs", order=i)
                if step.get("into") and (step["read"], step["into"]) not in fed:
                    fed.add((step["read"], step["into"]))
                    edge(f"skill:{step['read']}", f"table:{step['into']}", "reads into",
                         source=f"step {i} of {sk['name']}")
            if step.get("run"):
                edge(sid, f"skill:{step['run']}", "runs", order=i)
            if step.get("tell"):
                edge(sid, f"table:{step['tell']}", "tells", order=i)

    for a in automations:
        state = "off" if not a.get("enabled") else ("problem" if a.get("last_error") else "on")
        node(f"automation:{a['id']}", "automation", a["title"], subtitle=a.get("schedule"),
             state=state, detail=a.get("last_error"), module=a.get("module"))
        if a.get("module"):
            edge(f"automation:{a['id']}", f"module:{a['module']}", "in")
        if a.get("skill"):
            edge(f"automation:{a['id']}", f"skill:{a['skill']}", "runs")

    for s in world.sources.all():
        node(f"source:{s['id']}", "source", s["title"], subtitle=s["site"], state=s["status"],
             detail=s.get("detail"), module=s.get("module"))
        if s.get("module"):
            edge(f"source:{s['id']}", f"module:{s['module']}", "in")
        if s.get("reader"):
            edge(f"source:{s['id']}", f"skill:{s['reader']}", "read by")

    docs_by = {(r["connection"], r["module"]): r["n"] for r in world.store.all(
        "SELECT connection, module, COUNT(*) AS n FROM documents WHERE removed_at IS NULL"
        " AND connection IS NOT NULL GROUP BY connection, module")}
    for c in Connections(world.store).all():
        title = c["target"].rstrip("/").rsplit("/", 1)[-1] if c["connector"] == "files" \
            else c["target"]
        node(f"connection:{c['id']}", "connection", title, subtitle=c["connector"],
             state=c["status"], detail=c.get("last_error"))
        if c["connector"] == "browser":
            sites = set(signin_sites(c))
            for sk in skills:
                if sk.get("site") in sites:
                    edge(f"connection:{c['id']}", f"skill:{sk['name']}", "signed in at",
                         source=c["target"])
        elif c["connector"] == "files":
            for (cid, module), n in docs_by.items():
                if cid == c["id"] and module:
                    edge(f"connection:{c['id']}", f"module:{module}", "feeds", count=n)

    return {"nodes": nodes, "edges": edges, "at": now()}
