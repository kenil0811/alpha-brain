"""Routes for what Alpha knows about the person and what it can do across projects: facts
(add, correct, forget), skills (make, run, retire), first steps, project links and row actions.
Mounted by `create_app`; the same guard and world.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from alpha.context import onboarding
from alpha.runtime.turn import Runner
from alpha.world import links
from alpha.world import person_skills as skills
from alpha.world.store import Problem
from alpha.world.world import World


class FactBody(BaseModel):
    predicate: str
    value: str


class SkillBody(BaseModel):
    title: str
    description: str = ""
    instructions: str
    inputs: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    produces: str = ""


class RunBody(BaseModel):
    inputs: dict[str, Any] = Field(default_factory=dict)


class AnswersBody(BaseModel):
    answers: dict[str, str]


class ReadBody(BaseModel):
    reads: str
    enabled: bool


def _words(predicate: str) -> str:
    return predicate.replace("_", " ")


def mount(app: FastAPI, world: World, api: Any, runner: Runner) -> None:
    # ---- facts about the person ----

    @app.post("/api/facts", dependencies=[api])
    def add_fact(body: FactBody) -> dict[str, Any]:
        if not body.value.strip():
            raise Problem("Say what it is.")
        fact = world.knowledge.record_fact("person", body.predicate, body.value.strip(),
                                           source="person", state="accepted", confidence=1.0)
        world.journal.append("changed", f"You told Alpha your {_words(fact['predicate'])}.",
                             actor="person", data={"fact": fact["id"]})
        return fact

    @app.delete("/api/facts/{fid}", dependencies=[api])
    def forget_fact(fid: str) -> dict[str, Any]:
        fact = world.knowledge.forget_fact(fid)
        # Whatever recorded it in the journal says nothing any more (the permitted tombstone).
        for row in world.store.all(
                "SELECT id FROM journal WHERE deleted_at IS NULL"
                " AND json_extract(data, '$.fact') = ?", (fid,)):
            world.journal.forget(row["id"])
        world.journal.append("changed", f"You asked Alpha to forget your"
                             f" {_words(fact['predicate'])}.", actor="person")
        return {"forgotten": fid}

    # ---- skills ----

    @app.get("/api/my-skills", dependencies=[api])
    def list_skills() -> list[dict[str, Any]]:
        return skills.all_skills(world.store)

    @app.post("/api/my-skills", dependencies=[api])
    def create_skill(body: SkillBody) -> dict[str, Any]:
        skill = skills.create_skill(world.store, body.model_dump())
        world.journal.append("made", f"You made the skill {skill['title']}.", actor="person")
        return skill

    @app.get("/api/my-skills/{sid}", dependencies=[api])
    def get_skill(sid: str) -> dict[str, Any]:
        return {"skill": skills.get_skill(world.store, sid), "runs": skills.runs(world, sid)}

    @app.delete("/api/my-skills/{sid}", dependencies=[api])
    def retire_skill(sid: str) -> dict[str, Any]:
        skill = skills.retire_skill(world.store, sid)
        world.journal.append("changed", f"You retired the skill {skill['title']}.",
                             actor="person")
        return {"retired": sid}

    @app.post("/api/my-skills/{sid}/run", dependencies=[api])
    def run_skill(sid: str, body: RunBody) -> dict[str, Any]:
        return skills.run_skill(world, sid, body.inputs, runner)

    # ---- row actions: a skill run on one row ----

    @app.get("/api/tables/{name}/row-actions", dependencies=[api])
    def row_actions(name: str) -> list[dict[str, Any]]:
        return skills.row_actions(world.store, name)

    @app.post("/api/tables/{name}/rows/{rid}/run/{sid}", dependencies=[api])
    def run_on_row(name: str, rid: str, sid: str) -> dict[str, Any]:
        row = world.collections.get(name, rid)
        if sid not in {a["skill"] for a in skills.row_actions(world.store, name)}:
            raise Problem("That skill isn't a row action of this table.")
        values = {k: v for k, v in row.items() if k not in {"revision", "_provenance"}}
        return skills.run_skill(world, sid, {**values, "table": name}, runner)

    # ---- first steps ----

    @app.get("/api/onboarding", dependencies=[api])
    def onboarding_status() -> dict[str, Any]:
        return onboarding.status(world)

    @app.post("/api/onboarding", dependencies=[api])
    def onboarding_answer(body: AnswersBody) -> dict[str, Any]:
        return onboarding.answer(world, body.answers, runner)

    @app.post("/api/onboarding/skip", dependencies=[api])
    def onboarding_skip() -> dict[str, Any]:
        return onboarding.skip(world)

    # ---- project links ----

    @app.get("/api/links", dependencies=[api])
    def project_links() -> list[dict[str, Any]]:
        return links.links(world)

    @app.put("/api/modules/{ref}/reads", dependencies=[api])
    def set_read(ref: str, body: ReadBody) -> list[dict[str, Any]]:
        out = links.set_read(world, ref, body.reads, body.enabled)
        module = world.modules.get(ref)
        world.journal.append("changed", f"You switched {'on' if body.enabled else 'off'}"
                             f" {module['name']} reading {world.modules.get(body.reads)['name']}.",
                             actor="person", module=module["id"])
        return out
