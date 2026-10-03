"""Skills: reusable abilities that live outside any project, made, run and retired by the person.

A skill is a procedure in the person's words (what it does, the steps, what it needs, the sources
it may read, what it produces), kept in `meta` under `skill:<id>`. Running one is a Chief of
Staff turn in its own job thread with the steps as the instructions; the result (a summary, the
items found, where it looked) is journaled as `made` with `data.skill`, so the last runs are just
journal reads. Anything that would reach outside Alpha goes through `propose` like any other
turn: a skill never writes outward on its own.

Row actions (a skill attached to a table, run on one row) live in `meta row_actions:<table>`.
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any

from alpha.world.store import Problem, Store, dumps, loads, new_id, now

if TYPE_CHECKING:
    from alpha.runtime.turn import Runner
    from alpha.world.world import World


def meta_get(store: Store, key: str, default: Any = None) -> Any:
    row = store.one("SELECT value FROM meta WHERE key = ?", (key,))
    return loads(row["value"], default) if row else default


def meta_put(store: Store, key: str, value: Any) -> None:
    with store.tx() as db:
        if value is None:
            db.execute("DELETE FROM meta WHERE key = ?", (key,))
        else:
            db.execute("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key)"
                       " DO UPDATE SET value = excluded.value", (key, dumps(value)))


def _name(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")


def all_skills(store: Store) -> list[dict[str, Any]]:
    rows = store.all("SELECT value FROM meta WHERE key LIKE 'skill:%'")
    skills = [loads(r["value"], {}) for r in rows]
    return sorted((s for s in skills if not s.get("retired_at")), key=lambda s: s["created_at"])


def get_skill(store: Store, sid: str) -> dict[str, Any]:
    skill = meta_get(store, f"skill:{sid}")
    if not skill or skill.get("retired_at"):
        raise Problem(f"There is no skill {sid}.")
    return dict(skill)


def create_skill(store: Store, draft: dict[str, Any]) -> dict[str, Any]:
    title = str(draft.get("title") or "").strip()
    instructions = str(draft.get("instructions") or "").strip()
    if not title:
        raise Problem("A skill needs a name.")
    if not instructions:
        raise Problem("A skill needs its steps: how Alpha does it.")
    inputs = []
    for i in draft.get("inputs") or []:
        name = _name(str(i.get("name", "")))
        if name:
            inputs.append({"name": name, "description": str(i.get("description") or ""),
                           "required": bool(i.get("required", True))})
    skill = {
        "id": new_id("sk"), "title": title[:120],
        "description": str(draft.get("description") or "").strip()[:1000],
        "kind": "procedure", "instructions": instructions[:6000], "inputs": inputs,
        "sources": [str(s).strip() for s in draft.get("sources") or [] if str(s).strip()],
        "produces": str(draft.get("produces") or "").strip()[:400], "created_at": now(),
    }
    meta_put(store, f"skill:{skill['id']}", skill)
    return skill


def retire_skill(store: Store, sid: str) -> dict[str, Any]:
    skill = get_skill(store, sid)
    skill["retired_at"] = now()
    meta_put(store, f"skill:{sid}", skill)
    for row in store.all("SELECT key, value FROM meta WHERE key LIKE 'row_actions:%'"):
        ids = [s for s in loads(row["value"], []) if s != sid]
        meta_put(store, row["key"], ids or None)
    return skill


def runs(world: World, sid: str, limit: int = 5) -> list[dict[str, Any]]:
    rows = world.store.all(
        "SELECT at, data FROM journal WHERE kind = 'made' AND deleted_at IS NULL"
        " AND json_extract(data, '$.skill') = ? ORDER BY at DESC LIMIT ?", (sid, limit))
    return [{**loads(r["data"], {}), "started_at": r["at"]} for r in rows]


def prompt(skill: dict[str, Any], inputs: dict[str, Any]) -> str:
    given = "\n".join(f"- {k}: {v}" for k, v in inputs.items()) or "- (none)"
    return (
        f"Run the skill \"{skill['title']}\": {skill['description']}\n\n"
        f"HOW TO DO IT\n{skill['instructions']}\n\n"
        f"WHAT IT WAS GIVEN\n{given}\n\n"
        + (f"SOURCES IT MAY READ: {', '.join(skill['sources'])}\n" if skill["sources"] else "")
        + (f"IT PRODUCES: {skill['produces']}\n" if skill["produces"] else "")
        + "\nRead and work it out inside Alpha. Anything that would send, post or change "
        "something outside Alpha is proposed with propose_action, never done.\n"
        "End your reply with one JSON object and nothing after it: "
        '{"summary": "<one sentence>", "items": [{...one object per thing found...}], '
        '"evidence": [{"title": "...", "url": "...", "snippet": "..."}]}'
    )


def parse_result(reply: str) -> dict[str, Any]:
    """The JSON object a run ends with; a reply without one is its own summary."""
    start = reply.find("{")
    while start != -1:
        try:
            obj, _ = json.JSONDecoder().raw_decode(reply[start:])
        except ValueError:
            start = reply.find("{", start + 1)
            continue
        if isinstance(obj, dict) and ("summary" in obj or "items" in obj):
            items = [i for i in obj.get("items") or [] if isinstance(i, dict)]
            evidence = [e for e in obj.get("evidence") or [] if isinstance(e, dict)]
            return {"summary": str(obj.get("summary") or f"Found {len(items)}."),
                    "items": items[:200], "evidence": evidence[:50]}
        start = reply.find("{", start + 1)
    return {"summary": reply.strip()[:2000] or "It finished without saying anything.",
            "items": [], "evidence": []}


def run_skill(world: World, sid: str, inputs: dict[str, Any], runner: Runner) -> dict[str, Any]:
    from alpha.runtime import turn as turns

    skill = get_skill(world.store, sid)
    missing = [i["name"] for i in skill["inputs"] if i["required"]
               and not str(inputs.get(i["name"], "")).strip()]
    if missing:
        raise Problem(f"This skill needs {', '.join(missing)}.")
    thread = world.modules.open_thread(f"Skill: {skill['title']}", "job")
    out = turns.ask(world, prompt(skill, inputs), thread=thread["id"], runner=runner,
                    actor="alpha")
    result = parse_result(out.reply) if out.ok else {
        "summary": out.reply or "The run did not finish.", "items": [], "evidence": []}
    data = {"skill": sid, "inputs": inputs, "state": "done" if out.ok else "failed",
            "thread": thread["id"], **result}
    world.journal.append("made", f"Ran the skill {skill['title']}: {result['summary']}"[:500],
                         data=data, thread=thread["id"])
    return {**data, "started_at": now()}


def row_actions(store: Store, table: str) -> list[dict[str, Any]]:
    live = {s["id"]: s for s in all_skills(store)}
    return [{"skill": sid, "title": live[sid]["title"]}
            for sid in meta_get(store, f"row_actions:{table}", []) if sid in live]


def attach_row_action(store: Store, table: str, sid: str) -> list[dict[str, Any]]:
    get_skill(store, sid)
    ids = meta_get(store, f"row_actions:{table}", [])
    if sid not in ids:
        meta_put(store, f"row_actions:{table}", [*ids, sid])
    return row_actions(store, table)
