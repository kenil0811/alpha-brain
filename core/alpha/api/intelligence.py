"""Routes for Intelligence: skills, automations, permissions, the two maps."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    SwitchBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    automation_views,
)
from alpha.connectors.base import Connections, manifests
from alpha.context.graph import work_graph, world_graph
from alpha.runtime import connecting
from alpha.world.store import Problem


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    scheduler = s.scheduler
    api = s.api

    @app.get("/api/intelligence", dependencies=[api])
    def intelligence() -> dict[str, Any]:
        pages = {n["scope"].removeprefix("skill:"): n for n in world.knowledge.notes()
                 if n["scope"].startswith("skill:")}
        return {
            "hands": [{"name": m["name"], "title": m.get("title", m["name"]),
                       "description": m.get("description"), "tools": m.get("tools", []),
                       "origin": m.get("origin")} for m in manifests()],
            "skills": [{**{k: sk[k] for k in ("name", "kind", "site", "module", "url",
                                             "description", "when_to_use", "effect",
                                             "fields", "version", "health", "last_problem",
                                             "last_run_at", "last_count", "last_ok_count",
                                             "source", "updated_at")},
                        "notes": pages[sk["name"]]["body"] if sk["name"] in pages else None}
                       for sk in world.skills.all()],
            "automations": automation_views(world, scheduler),
            "readers": world.readers.all(),
            "connections": Connections(world.store).all(),
            "knowledge": {
                "facts": world.knowledge.facts("person"),
                "notes": world.knowledge.notes(),
                "goals": world.knowledge.goals(None),
                "permissions": world.permissions.live(),
            },
            "procedures": world.procedures.all(),
        }

    @app.get("/api/skills/{name}", dependencies=[api])
    def skill_page(name: str) -> dict[str, Any]:
        """One skill in full for its page: what it is, its body (read-only in the window: the
        model repairs skills, the person asks it to), Alpha's notes page, and its runs."""
        skill = world.skills.get(name)
        page = world.knowledge.find_note(f"skill:{name}", name)
        runs = [e for e in world.journal.recent(300)
                if name in {e["data"].get("reader"), e["data"].get("procedure"),
                            e["data"].get("skill")}]
        return {**skill, "notes": page, "runs": [
            {"at": e["at"], "kind": e["kind"], "text": e["text"]} for e in runs[-20:]]}

    @app.get("/api/automations/{aid}", dependencies=[api])
    def automation_page(aid: str) -> dict[str, Any]:
        """One automation for its page, with its runs: the entries of its thread, grouped by
        each run's start, newest run first."""
        auto = next((a for a in automation_views(world, scheduler) if a["id"] == aid), None)
        if auto is None:
            raise Problem(f"There is no automation {aid}.")
        runs: list[dict[str, Any]] = []
        if auto["thread"]:
            for e in world.journal.recent(400, thread=auto["thread"]):
                if e["kind"] == "did" and e["text"].startswith("Run the automation"):
                    runs.append({"at": e["at"], "lines": [], "outcome": None})
                    continue
                if not runs:
                    continue
                if e["kind"] in {"saw", "did", "made", "changed", "failed", "noticed", "asked"}:
                    runs[-1]["lines"].append({"at": e["at"], "kind": e["kind"],
                                              "text": e["text"][:300]})
                if e["kind"] in {"replied", "failed", "noticed"}:
                    runs[-1]["outcome"] = e["text"][:400]
        skill = world.skills.get(auto["skill"]) if auto.get("skill") else None
        return {**auto, "runs": list(reversed(runs))[:12],
                "pipeline": skill["steps"] if skill else None}

    @app.post("/api/permissions/{pid}/revoke", dependencies=[api])
    def revoke_permission(pid: str) -> dict[str, Any]:
        revoked = world.permissions.revoke(pid)
        world.journal.append("changed", f"Revoked a standing permission: {revoked['sentence']}",
                             actor="person", data={"permission": pid})
        return revoked

    @app.get("/api/automations", dependencies=[api])
    def automations() -> list[dict[str, Any]]:
        return automation_views(world, scheduler)

    @app.patch("/api/automations/{aid}", dependencies=[api])
    def switch_automation(aid: str, body: SwitchBody) -> dict[str, Any]:
        auto = world.automations.update(aid, enabled=body.enabled)
        world.journal.append("changed", f"You switched {'on' if body.enabled else 'off'}:"
                             f" {auto['title']}.", actor="person", module=auto["module"])
        return auto

    @app.post("/api/automations/{aid}/run", dependencies=[api])
    def run_automation(aid: str) -> dict[str, Any]:
        scheduler.run_now(aid)
        return next(a for a in automation_views(world, scheduler) if a["id"] == aid)

    @app.get("/api/graph", dependencies=[api])
    def graph(kind: str = "work") -> dict[str, Any]:
        """Two maps computed from the world on each ask (context/graph.py): `work`, Alpha's own
        plumbing; `world`, the person's brain: what it holds, how it connects, what does not."""
        if kind == "work":
            return work_graph(world, automation_views(world, scheduler))
        if kind == "world":
            return world_graph(world)
        raise Problem("A map is of kind work or world.")

    @app.post("/api/graph/connect", dependencies=[api])
    def graph_connect() -> dict[str, Any]:
        """On the person's ask, Alpha looks over the map of their brain for links between things
        that are not connected and keeps the grounded ones as suggested facts, with reasons."""
        return connecting.connect(world)
