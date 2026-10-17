"""Routes for Intelligence: skills, agents, permissions, the two maps."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    AgentBody,
    CorrectFactBody,
    GoalBody,
    SkillTextBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    agent_views,
    opens_run,
)
from alpha.connectors.base import Connections, manifests
from alpha.connectors.files import unique_path
from alpha.context.graph import work_graph, world_graph
from alpha.context.memory_export import memory, to_markdown
from alpha.runtime import connecting, running
from alpha.runtime.agents import WORDS
from alpha.world import purge
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
            "agents": agent_views(world, scheduler),
            "readers": world.readers.all(),
            "connections": Connections(world.store).all(),
            "knowledge": {
                "facts": world.knowledge.facts("person"),
                "notes": world.knowledge.notes(),
                "goals": world.knowledge.goals(None),
                "commitments": world.commitments.of("person", ("open", "done")),
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

    @app.get("/api/goals/{gid}", dependencies=[api])
    def goal_page(gid: str) -> dict[str, Any]:
        """One goal's own page (D12): the goal, its module and what happened to it."""
        goal = world.knowledge.goal(gid)
        try:
            module = world.modules.get(goal["module"])["name"] if goal["module"] else None
        except Problem:
            module = None
        from alpha.runtime.agents import scout

        return {**goal, "module_name": module, "history": world.journal.of_goal(gid),
                "picks": [p for p in scout.picks_of_day(world)
                          if p.get("goal") == gid and not p["decided"]]}

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
        return {**skill, "notes": page, "versions": world.skills.versions(name),
                "text": world.skills.text(name), "runs": [
            {"at": e["at"], "kind": e["kind"], "text": e["text"]} for e in runs[-20:]]}

    @app.put("/api/skills/{name}/text", dependencies=[api])
    def edit_skill_text(name: str, body: SkillTextBody) -> dict[str, Any]:
        """The person's edit of a skill's SKILL.md (the harness, slice 2b): a new version in
        its history, journaled as theirs; the frontmatter must keep the name and kind."""
        before = world.skills.get(name)
        saved = world.skills.write_text(name, body.text, by="person")
        world.journal.append("changed", f"You edited the skill {name} (version"
                             f" {saved['version']}).", actor="person",
                             data={"skill": name, "from": before["version"],
                                   "to": saved["version"]})
        return {**saved, "text": world.skills.text(name),
                "versions": world.skills.versions(name)}

    @app.post("/api/skills/{name}/restore/{version}", dependencies=[api])
    def restore_skill(name: str, version: int) -> dict[str, Any]:
        """Bring back an earlier version of a skill ("Undo this repair", Q49), as a new
        version, journaled as the person's."""
        before = world.skills.get(name)
        restored = world.skills.restore(name, version, by="person")
        world.journal.append("changed", f"You took {name} back to version {version} (it was"
                             f" {before['version']}; now {restored['version']}).",
                             actor="person", data={"skill": name, "from": before["version"],
                                                   "to": restored["version"],
                                                   "restored": version})
        return restored

    @app.get("/api/agents/{aid}", dependencies=[api])
    def agent_page(aid: str) -> dict[str, Any]:
        """One agent for its page (Q50): its brief and notes, what it may touch, the decisions
        about it, its pipeline, and its runs with the entries of its thread grouped by each
        run's start, newest run first."""
        auto = next((a for a in agent_views(world, scheduler) if a["id"] == aid), None)
        if auto is None:
            raise Problem(f"There is no agent {aid}.")
        entries = world.journal.recent(400, thread=auto["thread"]) if auto["thread"] else []
        own = world.journal.recent(400, actor=aid)
        seen_ids = {e["id"] for e in entries}
        entries = sorted(entries + [e for e in own if e["id"] not in seen_ids],
                         key=lambda e: (e["at"], e["id"]))
        runs: list[dict[str, Any]] = []
        for r in world.runs.of(aid, 12):
            until = r["ended_at"] or "9999"
            lines = [{"at": e["at"], "kind": e["kind"], "text": e["text"][:300],
                      "data": {k: e["data"].get(k) for k in ("skill", "part", "from", "to",
                                                             "repair", "held")
                               if e["data"].get(k) is not None}}
                     for e in entries if r["started_at"] <= e["at"] <= until
                     and e["kind"] in {"saw", "did", "made", "changed", "failed", "noticed",
                                       "asked"} and not opens_run(e)]
            runs.append({**r, "lines": lines[-40:]})
        skill = world.skills.get(auto["skill"]) if auto.get("skill") else None
        sources = sum(1 for s in (skill["steps"] if skill else []) if "read" in s)
        good = WORDS.get(auto["kind"], {}).get("good_run") or (
            (f"every one of its {sources} source{'s' if sources != 1 else ''} read and"
             " every reader healthy; partial when some were; failed when none were")
            if skill else "it ends with its line for the log; failed when the model could"
            " not finish or Alpha's tools didn't answer")
        return {**auto, "runs": runs, "pipeline": skill["steps"] if skill else None,
                "brief": world.knowledge.find_note(f"agent:{aid}", "Brief"),
                "notes": world.knowledge.find_note(f"agent:{aid}", "Notes"),
                "decisions": world.decisions.about("agent", aid),
                "good_run": good}

    @app.get("/api/agents/{aid}/removal", dependencies=[api])
    def agent_removal(aid: str) -> dict[str, Any]:
        """What deleting a custom agent takes with it, in words, before the person confirms."""
        return purge.agent_removal(world, aid)

    @app.delete("/api/agents/{aid}", dependencies=[api])
    def delete_agent(aid: str) -> dict[str, Any]:
        """Delete a custom agent and everything it made; the journal keeps every line."""
        return purge.remove_agent(world, aid)

    @app.post("/api/permissions/{pid}/revoke", dependencies=[api])
    def revoke_permission(pid: str) -> dict[str, Any]:
        revoked = world.permissions.revoke(pid)
        world.journal.append("changed", f"Revoked a standing permission: {revoked['sentence']}",
                             actor="person", data={"permission": pid})
        return revoked

    @app.get("/api/agents", dependencies=[api])
    def agents() -> list[dict[str, Any]]:
        return agent_views(world, scheduler)

    @app.patch("/api/agents/{aid}", dependencies=[api])
    def change_agent(aid: str, body: AgentBody) -> dict[str, Any]:
        """Pause an agent or set it going, or rename it; each journaled as the person's."""
        before = world.agents.get(aid)
        name = (body.name or "").strip()
        if not body.state and not name:
            raise Problem("Say what to change: its state (on or paused) or its name.")
        auto = world.agents.update(aid, state=body.state, name=name or None)
        if body.state and body.state != before["state"]:
            world.journal.append("changed", f"You {'set going' if body.state == 'on' else 'paused'}"
                                 f" {auto['name']}.", actor="person", module=auto["module"],
                                 data={"agent": aid})
        if name and name != before["name"]:
            world.journal.append("changed", f"You renamed the agent {before['name']} to"
                                 f" {name}.", actor="person", module=auto["module"],
                                 data={"agent": aid})
        return auto

    @app.post("/api/agents/{aid}/run", dependencies=[api])
    def run_agent(aid: str) -> dict[str, Any]:
        scheduler.run_now(aid)
        return next(a for a in agent_views(world, scheduler) if a["id"] == aid)

    @app.post("/api/agents/{aid}/stop", dependencies=[api])
    def stop_agent(aid: str) -> dict[str, Any]:
        """Stop an agent's run now (Stop on its page, Skip on a workflow card): the model run
        in its thread ends with "You stopped it." and the run is `stopped`. A skipped look of
        Sherlock's is the person's decision: no research for that page or conversation."""
        agent = world.agents.get(aid)
        run = world.runs.open(aid)
        what = None
        if run and agent.get("thread"):
            for e in reversed(world.journal.recent(20, thread=agent["thread"], kinds=["did"])):
                if e["at"] < run["started_at"]:
                    break
                d = e["data"]
                if d.get("workflow") or d.get("conversation"):
                    what = d
                    break
        if agent["kind"] == "sherlock" and what:
            key = "workflow" if what.get("workflow") else "conversation"
            title = (world.workflows.get(what["workflow"])["title"] if key == "workflow"
                     else world.modules.thread(what["conversation"])["title"])
            world.decisions.record(by="person", what=f"No research for {title}",
                                   why="you skipped Sherlock's look",
                                   about={key: what[key], "no_research": True, "agent": aid})
            world.journal.append("did", f"You skipped Sherlock's look at {title}.",
                                 actor="person", data={"agent": aid, key: what[key]},
                                 thread=what.get("conversation") if key == "conversation"
                                 else None)
        stopped = bool(agent.get("thread")) and running.LIVE.stop(str(agent["thread"]))
        return {**next(a for a in agent_views(world, scheduler) if a["id"] == aid),
                "stopped": stopped}

    @app.get("/api/graph", dependencies=[api])
    def graph(kind: str = "work") -> dict[str, Any]:
        """Two maps computed from the world on each ask (context/graph.py): `work`, Alpha's own
        plumbing; `world`, the person's brain: what it holds, how it connects, what does not."""
        if kind == "work":
            return work_graph(world, agent_views(world, scheduler))
        if kind == "world":
            return world_graph(world)
        raise Problem("A map is of kind work or world.")

    @app.post("/api/graph/connect", dependencies=[api])
    def graph_connect() -> dict[str, Any]:
        """On the person's ask, Alpha looks over the map of their brain for links between things
        that are not connected and keeps the grounded ones as suggested facts, with reasons."""
        return connecting.connect(world)
