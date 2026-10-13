"""Routes for Intelligence: skills, automations, permissions, the two maps."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    CorrectFactBody,
    GoalBody,
    SwitchBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    automation_views,
)
from alpha.connectors.base import Connections, manifests
from alpha.connectors.files import unique_path
from alpha.context.graph import work_graph, world_graph
from alpha.context.memory_export import memory, to_markdown
from alpha.runtime import connecting
from alpha.world.store import Problem, dumps, now
from alpha.world.world import alpha_home


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

    @app.post("/api/facts/{fid}/correct", dependencies=[api])
    def correct_fact(fid: str, body: CorrectFactBody) -> dict[str, Any]:
        """The person's own value for a known fact (13 Oct, slice 2 D1); the old one kept as
        replaced."""
        before = world.knowledge.fact(fid)
        new = world.knowledge.correct_fact(fid, body.value)
        what = before["predicate"].replace("_", " ")
        world.journal.append("changed", f"You corrected {what}: {before['value']} → "
                             f"{new['value']}.", actor="person", data={"fact": new["id"],
                                                                       "before": fid})
        return new

    @app.delete("/api/facts/{fid}", dependencies=[api])
    def forget_fact(fid: str) -> dict[str, Any]:
        """The person asks Alpha to forget a fact (D1): deleted with the values it replaced;
        the journal keeps what was said."""
        gone = world.knowledge.forget_fact(fid)
        what = gone["predicate"].replace("_", " ")
        world.journal.append("changed", f"You asked Alpha to forget: {what[:1].upper()}"
                             f"{what[1:]}.", actor="person", data={"forgot": fid})
        return gone

    @app.post("/api/goals", dependencies=[api])
    def add_goal(body: GoalBody) -> dict[str, Any]:
        """A goal the person types (D11): saved at once, journaled as theirs."""
        module_id = world.modules.get(body.module)["id"] if body.module else None
        goal = world.knowledge.set_goal(" ".join((body.text or "").split()), module_id)
        world.journal.append("changed", f"You set a goal: {goal['text']}", actor="person",
                             module=module_id, data={"goal": goal["id"]})
        return goal

    @app.patch("/api/goals/{gid}", dependencies=[api])
    def change_goal(gid: str, body: GoalBody) -> dict[str, Any]:
        """A goal's words rewritten, or marked done or dropped, or made active again (D1)."""
        goal = world.knowledge.goal(gid)
        if body.text is not None and body.text.strip() != goal["text"]:
            goal = world.knowledge.edit_goal(gid, body.text)
            world.journal.append("changed", f"You rewrote a goal: {goal['text']}",
                                 actor="person", module=goal["module"], data={"goal": gid})
        if body.state is not None and body.state != goal["state"]:
            goal = world.knowledge.update_goal(gid, body.state)
            words = {"done": "marked done", "dropped": "dropped", "active": "picked up again"}
            world.journal.append("changed", f"You {words.get(body.state, body.state)} the goal:"
                                 f" {goal['text']}", actor="person", module=goal["module"],
                                 data={"goal": gid})
        return goal

    @app.post("/api/memory/export", dependencies=[api])
    def export_memory() -> dict[str, Any]:
        """Everything Alpha remembers, as Markdown and JSON in Alpha's exports folder (D1b),
        for the person to keep or take away; the app shows them in Finder."""
        mem = memory(world)
        at = now()
        folder = alpha_home() / "exports"
        local = datetime.now().astimezone()  # the Mac's own time, as the table export names it
        stamp = local.strftime("%Y-%m-%d %H.%M")
        md = unique_path(folder, f"What Alpha remembers {stamp}.md")
        md.write_text(to_markdown(mem, at=local.strftime("%d %b %Y, %H:%M")), encoding="utf-8")
        js = unique_path(folder, f"What Alpha remembers {stamp}.json")
        js.write_text(dumps({"exported": at, **mem}), encoding="utf-8")
        items = (len(mem["about_you"]) + len(mem["goals"]) + len(mem["instructions"])
                 + len(mem["permissions"]) + len(mem["module_pages"]) + len(mem["notes"])
                 + len(mem["people"]))
        world.journal.append("did", f"Exported what Alpha remembers ({items} items) to"
                             f" {md.name} and {js.name}.", actor="person",
                             data={"path": str(md), "json": str(js)})
        return {"markdown": str(md), "json": str(js), "items": items}

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
        entries = world.journal.recent(400, thread=auto["thread"]) if auto["thread"] else []
        runs: list[dict[str, Any]] = []
        for r in world.runs.of(aid, 12):
            until = r["ended_at"] or "9999"
            lines = [{"at": e["at"], "kind": e["kind"], "text": e["text"][:300]}
                     for e in entries if r["started_at"] <= e["at"] <= until
                     and e["kind"] in {"saw", "did", "made", "changed", "failed", "noticed",
                                       "asked"}
                     and not e["text"].startswith("Run the automation")]
            runs.append({**r, "lines": lines[-40:]})
        skill = world.skills.get(auto["skill"]) if auto.get("skill") else None
        sources = sum(1 for s in (skill["steps"] if skill else []) if "read" in s)
        good = ((f"every one of its {sources} source{'s' if sources != 1 else ''} read and"
                 " every reader healthy; partial when some were; failed when none were")
                if skill else "it ends with its line for the log; failed when the model could"
                " not finish or Alpha's tools didn't answer")
        return {**auto, "runs": runs, "pipeline": skill["steps"] if skill else None,
                "guidelines": world.knowledge.find_note(f"agent:{aid}", auto["title"]),
                "good_run": good}

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
