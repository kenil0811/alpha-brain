"""Edits to a table that are more than one write: many rows at once, a field changing kind, and
undo. Each is one journal entry whose data says exactly what changed (values before and after,
the removed records, the field before and after), which is what lets undo put it back and lets a
record's page show who changed what, and in which turn.
"""

from __future__ import annotations

from typing import Any

from alpha.world.journal import entry
from alpha.world.store import Problem
from alpha.world.world import World

# Journal data that says how to put an edit back.
UNDOABLE = ("field_change", "records", "removed_records", "before", "removed")


def _did(world: World, collection: str, kind: str, text: str, data: dict[str, Any], *,
         actor: str, extra: dict[str, Any] | None = None) -> str:
    module = world.collections.describe(collection)["module"]
    extra = dict(extra or {})
    thread = extra.pop("thread", None)
    return world.journal.append(kind, text, actor=actor,
                                data={"collection": collection, **data, **extra},
                                module=module, thread=thread)


def bulk(world: World, collection: str, action: str, items: list[dict[str, Any]],
         values: dict[str, Any] | None, *, actor: str, provenance: dict[str, Any],
         extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """Set the same values on many rows, or remove many rows: one journal entry for all of
    them. A row someone changed meanwhile is left alone and counted in `skipped`."""
    if action not in {"set", "delete"}:
        raise Problem("A bulk edit either sets values or removes rows.")
    if action == "set" and not values:
        raise Problem("Say which values to set on the rows.")
    title = world.collections.describe(collection)["title"]
    changed: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []
    skipped: list[str] = []
    for item in items:
        rid, revision = str(item["id"]), int(item["revision"])
        try:
            before = world.collections.get(collection, rid)
            if action == "set":
                assert values is not None
                world.collections.update(collection, rid, values, revision, provenance)
                changed.append({"record": rid, "before": {k: before.get(k) for k in values},
                                "after": values})
            else:
                world.collections.delete(collection, rid, revision)
                removed.append(before)
        except Problem as e:
            if not changed and not removed and len(items) == 1:
                raise
            skipped.append(f"{rid}: {e}")
    who = "You" if actor == "person" else "Alpha"
    n = len(changed) or len(removed)
    rows = f"{n} {'row' if n == 1 else 'rows'}"
    if action == "set" and changed:
        assert values is not None
        _did(world, collection, "changed",
             f"{who} set {', '.join(values)} on {rows} in {title}.",
             {"records": changed}, actor=actor, extra=extra)
    elif removed:
        _did(world, collection, "changed", f"{who} removed {rows} from {title}.",
             {"removed_records": removed}, actor=actor, extra=extra)
    return {"done": n, "skipped": skipped}


def change_field(world: World, collection: str, field: str, *, actor: str,
                 extra: dict[str, Any] | None = None, **change: Any) -> dict[str, Any]:
    result = world.collections.change_field(collection, field, **change)
    before, after = result["before"], result["after"]
    if before != after:
        words = [f"{before['kind']} → {after['kind']}"] if before["kind"] != after["kind"] else []
        if before.get("label") != after.get("label"):
            words.append(f"renamed to {after.get('label') or after['name']}")
        if before.get("choices") != after.get("choices") and before["kind"] == after["kind"]:
            words.append("choices changed")
        who = "You" if actor == "person" else "Alpha"
        _did(world, collection, "changed",
             f"{who} changed {field} in {result['table']['title']}: {', '.join(words)}"
             + (f" ({result['rewritten']} rows converted)." if result["rewritten"] else "."),
             {"field_change": {"field": field, "before": before, "after": after}},
             actor=actor, extra=extra)
    return result


def _undone(world: World, collection: str) -> set[str]:
    return {str(r["u"]) for r in world.store.all(
        "SELECT json_extract(data, '$.undo') AS u FROM journal WHERE deleted_at IS NULL"
        " AND json_extract(data, '$.collection') = ? AND json_extract(data, '$.undo') IS NOT NULL",
        (collection,))}


def last_edit(world: World, collection: str) -> dict[str, Any] | None:
    """The newest edit to this table, by anyone, that undo can put back and hasn't yet."""
    undone = _undone(world, collection)
    for row in world.store.all(
        "SELECT * FROM journal WHERE deleted_at IS NULL AND kind IN ('did', 'changed')"
        " AND json_extract(data, '$.collection') = ? AND json_extract(data, '$.undo') IS NULL"
        " ORDER BY at DESC, rowid DESC LIMIT 200", (collection,),
    ):
        e = entry(row)
        d = e["data"]
        if e["id"] in undone:
            continue
        if any(k in d for k in UNDOABLE) or (e["kind"] == "did" and d.get("record")):
            return e
    return None


def _same(world: World, collection: str, rid: str, after: dict[str, Any]) -> dict[str, Any]:
    """The record as it is now, if it still holds what the edit wrote; else a Problem."""
    current = world.collections.get(collection, rid)
    try:
        wrote = world.collections._validate(collection, after, partial=True)
    except Problem:
        wrote = None
    if wrote is None or any(current.get(k) != v for k, v in wrote.items()):
        raise Problem("That row has changed since, so the edit wasn't undone.")
    return current


def undo(world: World, collection: str, *, actor: str, provenance: dict[str, Any],
         extra: dict[str, Any] | None = None) -> dict[str, Any]:
    target = last_edit(world, collection)
    if target is None:
        raise Problem(f"Nothing to undo in {world.collections.describe(collection)['title']}.")
    d, c = target["data"], world.collections
    if "field_change" in d:
        fc = d["field_change"]
        current = next(f for f in c.describe(collection)["fields"] if f["name"] == fc["field"])
        if current != fc["after"]:
            raise Problem("That field has changed since, so the change wasn't undone.")
        b = fc["before"]
        c.change_field(collection, fc["field"], kind=b["kind"], label=b.get("label") or "",
                       choices=b.get("choices"), relation=b.get("relation"))
    elif "records" in d:
        rows = [(i, _same(world, collection, i["record"], i["after"])) for i in d["records"]]
        for i, cur in rows:
            c.update(collection, i["record"], i["before"], cur["revision"], provenance)
    elif "removed_records" in d:
        for rec in d["removed_records"]:
            c.restore(collection, rec["id"], provenance)
    elif "before" in d:
        cur = _same(world, collection, d["record"], d["after"])
        c.update(collection, d["record"], d["before"], cur["revision"], provenance)
    elif "removed" in d:
        c.restore(collection, d["record"], provenance)
    else:  # an added row goes again
        cur = c.get(collection, d["record"])
        c.delete(collection, d["record"], cur["revision"])
    who = "You undid" if actor == "person" else "Undid"
    _did(world, collection, "changed", f"{who}: {target['text']}",
         {"undo": target["id"], **({"record": d["record"]} if d.get("record") else {})},
         actor=actor, extra=extra)
    return {"undone": target["id"], "text": target["text"]}


def history(world: World, collection: str, rid: str) -> list[dict[str, Any]]:
    """Every journal entry that touched one record, oldest first, with what the person said in
    the turn that made Alpha do it."""
    out = []
    for row in world.store.all(
        "SELECT * FROM journal WHERE deleted_at IS NULL"
        " AND json_extract(data, '$.collection') = ? AND instr(data, ?) > 0 ORDER BY at, rowid",
        (collection, f'"{rid}"'),
    ):
        e = entry(row)
        turn = e["data"].get("turn")
        said = None
        if turn:
            try:
                said = world.journal.read(turn)["text"]
            except Problem:
                said = None
        out.append({"id": e["id"], "at": e["at"], "kind": e["kind"], "actor": e["actor"],
                    "text": e["text"], "turn": turn, "said": said})
    return out
