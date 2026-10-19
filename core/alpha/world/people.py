"""People for real (P8 of people-and-contacts-proposal.md, Q97; 19 Oct 2026): who may be the
same, found by code and decided by the person.

Hard keys merge on their own (`entities.py`): the same email, phone or profile address is one
person. Everything softer is only ever proposed: the same name (two words or more, for a
person), the same name at the same organisation, the same email name at another domain, or a row
whose keys name two people already apart. The pairs wait on one card per batch, side by side,
with Merge and Keep apart; a Keep apart is remembered, so the pair never comes back; a merge can
be undone (Unmerge), which keeps the two apart from then on.
"""

from __future__ import annotations

from collections import defaultdict
from itertools import combinations
from typing import Any

from alpha.world import queries
from alpha.world.entities import MEMBER, name_key
from alpha.world.store import Problem, loads, new_id, now
from alpha.world.world import World

# an email name that says nothing about who reads it
SHARED_NAMES = frozenset({"info", "admin", "hello", "contact", "sales", "support", "office",
                          "team", "mail", "enquiries", "accounts", "billing", "noreply",
                          "no-reply", "help", "hr", "jobs", "careers", "marketing", "finance"})
SAME_NAME = "same name"
SAME_PLACE = "same name and organisation"
SAME_EMAIL_NAME = "same email name at another domain"
OPEN = ("found", "proposed")


def _organisations(world: World, eid: str) -> set[str]:
    return {o["id"] for o in world.entities.links(eid, MEMBER)}


def find(world: World) -> int:
    """Note every pair that may be the same and isn't noted yet; returns how many are new."""
    noted = 0
    groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    for r in world.store.all("SELECT id, kind, canonical FROM entities WHERE merged_into IS NULL"
                             " AND kind IN ('person', 'organisation')"):
        name = name_key(r["canonical"])
        if "@" in name or sum(ch.isdigit() for ch in name) > 3:
            continue  # named after its key: no name to compare
        if r["kind"] == "person" and len(name.split()) < 2:
            continue  # a first name alone is no evidence
        groups[(r["kind"], name)].append(r["id"])
    for (kind, _), named in groups.items():
        for a, b in combinations(named, 2):
            shared = kind == "person" and _organisations(world, a) & _organisations(world, b)
            noted += world.entities.note_pair(a, b, SAME_PLACE if shared else SAME_NAME)
    by_name: dict[str, set[str]] = defaultdict(set)
    for r in world.store.all("SELECT k.value, k.entity_id FROM entity_keys k JOIN entities e ON"
                             " e.id = k.entity_id WHERE k.key = 'email' AND e.kind = 'person'"):
        local = str(r["value"]).split("@")[0]
        if len(local) >= 4 and local not in SHARED_NAMES:
            by_name[local].add(world.entities.get(r["entity_id"])["id"])
    for holders in by_name.values():
        for a, b in combinations(sorted(holders), 2):
            noted += world.entities.note_pair(a, b, SAME_EMAIL_NAME)
    return noted


def withdraw_stale(world: World) -> int:
    """Pairs that are one entity by now (merged another way) or whose entity went."""
    gone = 0
    for r in world.store.all("SELECT * FROM maybe_same WHERE state IN ('found', 'proposed')"):
        try:
            same = world.entities.get(r["a"])["id"] == world.entities.get(r["b"])["id"]
        except Problem:
            same = True
        if same:
            with world.store.tx() as db:
                db.execute("UPDATE maybe_same SET state = 'withdrawn', decided_at = ? WHERE id = ?",
                           (now(), r["id"]))
            gone += 1
    return gone


def words(n: int) -> str:
    return f"{n} pair{'s' if n != 1 else ''} that may be the same person or company"


def propose(world: World) -> str | None:
    """The pairs found and not yet shown go on the open card, or on a new one: one card per
    batch. Returns the card."""
    fresh = [r["id"] for r in world.store.all("SELECT id FROM maybe_same WHERE state = 'found'"
                                              " ORDER BY created_at")]
    if not fresh:
        return None
    open_ = world.store.one(
        "SELECT m.batch, m.card FROM maybe_same m JOIN cards c ON c.id = m.card WHERE"
        " m.state = 'proposed' AND c.state = 'waiting' ORDER BY m.created_at DESC LIMIT 1")
    marks = ",".join("?" * len(fresh))
    if open_ is not None:
        batch, card = str(open_["batch"]), str(open_["card"])
        with world.store.tx() as db:
            db.execute(f"UPDATE maybe_same SET batch = ?, card = ?, state = 'proposed' WHERE id IN"
                       f" ({marks})", (batch, card, *fresh))
            n = db.execute("SELECT COUNT(*) AS n FROM maybe_same WHERE batch = ? AND state ="
                           " 'proposed'", (batch,)).fetchone()["n"]
            db.execute("UPDATE cards SET text = ? WHERE id = ?", (words(int(n)), card))
        return card
    batch = new_id("msb")
    with world.store.tx() as db:
        db.execute(f"UPDATE maybe_same SET batch = ?, state = 'proposed' WHERE id IN ({marks})",
                   (batch, *fresh))
    card = world.journal.append("proposed", words(len(fresh)), actor="alpha",
                                data={"pairs": batch, "why": "found by their names and keys;"
                                      " none is merged until you say"})
    with world.store.tx() as db:
        db.execute("UPDATE maybe_same SET card = ? WHERE batch = ?", (card, batch))
    return card


def settle(world: World) -> str | None:
    """After a read (a sync, an import, a table said to be people): stale pairs withdrawn, new
    ones found and proposed."""
    withdraw_stale(world)
    find(world)
    return propose(world)


MARK = "people_looked"


def settle_if_changed(world: World) -> str | None:
    """The scheduler's tick: `settle` only when people or organisations changed since the
    last look (a sync by any path, a table's rows linked), never every half minute for
    nothing."""
    row = world.store.one("SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM entities WHERE"
                          " kind IN ('person', 'organisation')")
    mark = f"{row['n']}:{row['at']}" if row else "0:"
    seen = world.store.one("SELECT value FROM meta WHERE key = ?", (MARK,))
    if seen is not None and seen["value"] == mark:
        return None
    card = settle(world)
    with world.store.tx() as db:
        db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (MARK, mark))
    return card


def _side(world: World, eid: str) -> dict[str, Any]:
    e = world.entities.get(eid)
    parts = world.entities.parts(e["id"])
    sources = [r["source"] for r in world.store.all(
        "SELECT DISTINCT source FROM entity_sources WHERE entity_id IN"
        f" ({','.join('?' * len(parts))})", tuple(parts))]
    return {"id": e["id"], "name": e["name"], "kind": e["kind"],
            "keys": {k: v for k, v in e["keys"].items() if k != "orgname"},
            "organisations": [o["name"] for o in world.entities.links(e["id"], MEMBER)],
            "sources": sources or ([e["source"]] if e.get("source") else [])}


def batch_view(world: World, batch: str) -> dict[str, Any]:
    """A card's pairs, side by side, the undecided first."""
    rows = world.store.all("SELECT * FROM maybe_same WHERE batch = ? ORDER BY state = 'proposed'"
                           " DESC, created_at", (batch,))
    pairs = []
    for r in rows:
        try:
            pairs.append({"id": r["id"], "why": r["why"], "state": r["state"],
                          "a": _side(world, r["a"]), "b": _side(world, r["b"])})
        except Problem:
            continue
    return {"id": batch, "pairs": pairs,
            "open": sum(1 for p in pairs if p["state"] == "proposed")}


def _close_if_done(world: World, batch: str) -> None:
    rows = world.store.all("SELECT state, card FROM maybe_same WHERE batch = ?", (batch,))
    if not rows or any(r["state"] == "proposed" for r in rows):
        return
    merged = sum(1 for r in rows if r["state"] == "merged")
    apart = sum(1 for r in rows if r["state"] == "apart")
    card = rows[0]["card"]
    if card and world.cards.get(str(card))["state"] == "waiting":
        world.journal.append("answered", f"Merged {merged}, kept {apart} apart.",
                             actor="person", data={"proposal": card, "accept": merged > 0})


def _two(a: dict[str, Any], b: dict[str, Any]) -> tuple[str, str]:
    """Two names as a line says them: with a way to reach each when the names are the same."""
    if name_key(a["name"]) != name_key(b["name"]):
        return a["name"], b["name"]

    def called(e: dict[str, Any]) -> str:
        reach = next((v for k in ("email", "phone", "url") for v in e["keys"].get(k, [])), None)
        return f"{e['name']} ({reach})" if reach else e["name"]
    return called(a), called(b)


def decide(world: World, pid: str, *, merge: bool) -> dict[str, Any]:
    """The person's Merge or Keep apart on one pair. The one Alpha has known longer is kept,
    the other merged into it (Unmerge undoes it)."""
    row = world.store.one("SELECT * FROM maybe_same WHERE id = ?", (pid,))
    if row is None:
        raise Problem(f"There is no pair {pid}.")
    if row["state"] != "proposed":
        raise Problem("That pair was decided already.")
    a, b = world.entities.get(row["a"]), world.entities.get(row["b"])
    state = "withdrawn" if a["id"] == b["id"] else "merged" if merge else "apart"
    if state == "merged":
        keep, other = sorted((a, b), key=lambda e: e["created_at"])
        said = _two(other, keep)
        world.entities.merge(keep["id"], other["id"])
        world.journal.append("changed", f"You said {said[0]} and {said[1]} are the same.",
                             actor="person", entity_ids=[keep["id"], other["id"]],
                             data={"pair": pid})
    elif state == "apart":
        said = _two(a, b)
        world.journal.append("changed", f"You kept {said[0]} and {said[1]} apart.",
                             actor="person", entity_ids=[a["id"], b["id"]], data={"pair": pid})
    with world.store.tx() as db:
        db.execute("UPDATE maybe_same SET state = ?, decided_at = ? WHERE id = ? AND state ="
                   " 'proposed'", (state, now(), pid))
    if row["batch"]:
        _close_if_done(world, str(row["batch"]))
    return batch_view(world, str(row["batch"])) if row["batch"] else {"id": None, "pairs": []}


def merge_same_place(world: World, batch: str) -> dict[str, Any]:
    """"Merge all with the same name and organisation": every such pair of the card."""
    for r in world.store.all("SELECT id FROM maybe_same WHERE batch = ? AND state = 'proposed'"
                             " AND why = ?", (batch, SAME_PLACE)):
        decide(world, str(r["id"]), merge=True)
    return batch_view(world, batch)


def unmerge(world: World, eid: str) -> dict[str, Any]:
    """Undo a merge: the entity stands alone again, and the two are kept apart from then on."""
    row = world.store.one("SELECT merged_into FROM entities WHERE id = ?", (eid,))
    if row is None or not row["merged_into"]:
        raise Problem("That one isn't merged into anyone.")
    parent = str(row["merged_into"])
    alone = world.entities.unmerge(eid)
    a, b = sorted((eid, parent))
    with world.store.tx() as db:
        updated = db.execute("UPDATE maybe_same SET state = 'apart', decided_at = ? WHERE a = ?"
                             " AND b = ?", (now(), a, b)).rowcount
        if not updated:
            db.execute("INSERT INTO maybe_same (id, a, b, why, state, created_at, decided_at)"
                       " VALUES (?,?,?,?, 'apart', ?, ?)",
                       (new_id("ms"), a, b, "unmerged by the person", now(), now()))
    said = _two(alone, world.entities.get(parent))
    world.journal.append("changed", f"You said {said[0]} is not {said[1]}.",
                         actor="person", entity_ids=[eid, parent])
    return alone


def sources_of(world: World, eid: str) -> list[dict[str, Any]]:
    """Where an entity came from, through its merges: each source with what it said."""
    parts = world.entities.parts(eid)
    marks = ",".join("?" * len(parts))
    return [{"source": r["source"], "ref": r["ref"], "entity": r["entity_id"],
             "details": loads(r["details"], {}), "updated_at": r["updated_at"]}
            for r in world.store.all(f"SELECT * FROM entity_sources WHERE entity_id IN ({marks})"
                                     " ORDER BY created_at", tuple(parts))]


DAYS = 90  # "how often lately" is the last 90 days, said with the number (P8)
NOW = "strftime('%Y-%m-%dT%H:%M:%S', 'now')"


def contact(world: World, eid: str) -> dict[str, Any]:
    """When the person last had to do with someone, and how often lately, per channel, from
    the `interactions` view (meetings and interaction tables): plain numbers, each traceable to
    its rows; no score."""
    root = world.entities.get(eid)["id"]
    channels = queries.read(
        world.path, "SELECT channel, COUNT(*) AS count, MAX(at) AS last,"
        " SUM(started_by = 'you') AS you, SUM(started_by = 'them') AS them FROM interactions"
        f" WHERE person = ? AND at >= date('now', '-{DAYS} days') AND at <= {NOW}"
        " GROUP BY channel ORDER BY count DESC", (root,))
    last = queries.read(world.path, f"SELECT MAX(at) AS at FROM interactions WHERE person = ?"
                        f" AND at <= {NOW}", (root,))
    return {"days": DAYS, "last": last[0]["at"] if last else None, "channels": channels,
            "total": sum(int(c["count"]) for c in channels),
            "you": sum(int(c["you"] or 0) for c in channels),
            "them": sum(int(c["them"] or 0) for c in channels)}


def interactions(world: World, eid: str, limit: int = 50) -> list[dict[str, Any]]:
    """Someone's interactions, newest first: meetings and rows of interaction tables."""
    return queries.read(world.path, "SELECT * FROM interactions WHERE person = ? ORDER BY at"
                        " DESC LIMIT ?", (world.entities.get(eid)["id"], limit))


def listed(world: World, kind: str | None = None, q: str | None = None) -> list[dict[str, Any]]:
    """Everyone, in one read of the views (no cap; PR #10's fix, ported): each with how to
    reach them, their organisations, their sources, last contact and the last 90 days, and
    when the journal last named them."""
    words = f"%{(q or '').strip().lower()}%"
    out: list[dict[str, Any]] = []
    if kind in (None, "person"):
        for r in queries.read(world.path, "SELECT * FROM people WHERE ? = '%%' OR lower(name)"
                              " LIKE ? OR lower(coalesce(emails, '')) LIKE ?",
                              (words, words, words)):
            keys = {k: [v.strip() for v in str(r[col]).split(",") if v.strip()]
                    for k, col in (("email", "emails"), ("phone", "phones"), ("url", "profiles"))
                    if r[col]}
            out.append({"id": r["id"], "kind": "person", "name": r["name"], "aliases": [],
                        "keys": keys, "organisation_names": r["organisations"],
                        "sources": str(r["sources"]).split(", ") if r["sources"] else [],
                        "last_contact": r["last_contact"], "in_90_days": r["in_90_days"]})
    if kind in (None, "organisation"):
        for r in queries.read(world.path, "SELECT * FROM organisations WHERE ? = '%%' OR"
                              " lower(name) LIKE ? OR lower(coalesce(domains, '')) LIKE ?",
                              (words, words, words)):
            keys = {"domain": [d.strip() for d in str(r["domains"]).split(",")]} \
                if r["domains"] else {}
            out.append({"id": r["id"], "kind": "organisation", "name": r["name"],
                        "aliases": [], "keys": keys, "member_count": r["people"],
                        "sources": str(r["sources"]).split(", ") if r["sources"] else []})
    # the journal's newest line naming each (SQLite gives the bare column of the MAX row)
    named = {str(r["eid"]): (r["at"], r["text"]) for r in world.store.all(
        "SELECT x.value AS eid, MAX(j.at) AS at, j.text AS text FROM journal j,"
        " json_each(j.entity_ids) x WHERE j.deleted_at IS NULL GROUP BY x.value")}
    pages = {str(r["scope"])[7:]: r["summary"] for r in world.store.all(
        "SELECT scope, summary FROM notes WHERE scope LIKE 'entity:%' AND summary IS NOT NULL")}
    for e in out:
        at, text = named.get(e["id"], (None, None))
        e["last_at"] = max(filter(None, (at, e.get("last_contact"))), default=None)
        e["last_text"] = text
        e["summary"] = pages.get(e["id"])
    return sorted(out, key=lambda e: e["last_at"] or "", reverse=True)
