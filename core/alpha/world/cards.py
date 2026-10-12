"""Dashboard cards (12 Oct 2026, the owner): no standard dashboard; Alpha proposes the cards a
table's dashboard should have, the person's yes keeps them, and they stay current because a card
is kept as what it measures, never as a number: the window works the number out from the rows
each time it shows it. A card is one of the window's kinds, chosen by a field's kind, never by
what a field means (the platform knows no domain):

- `metric`: a number: `count` of records, `sum` or `avg` of a number field, or `estimated` (how
  many values Alpha estimated);
- `breakdown`: records by a choice or status field;
- `overtime`: records (or a number field added up) by a date field;
- `attention`: the records that need attention (overdue, missing, estimated).

What a table looks like (`shape`: its fields, their kinds and choices, whether it has rows) is
kept per table, so a change that matters (a new table with rows, a new field, new choices) is
seen and Alpha proposes cards for it; rows coming and going change no shape, only the numbers.
"""

from __future__ import annotations

from typing import Any

from alpha.world.store import Problem, Store, dumps, loads, new_id, now

KINDS = ("metric", "breakdown", "overtime", "attention")
NUMERIC = {"number"}
CHOICE = {"choice", "status", "multichoice"}
DATE = {"date", "datetime"}


def check_card(card: dict[str, Any], fields: list[dict[str, Any]]) -> dict[str, Any]:
    """The card as kept ({type, field, measure, title, why}), or a Problem saying what is wrong
    with it in words the model can act on."""
    kind = card.get("type")
    field, measure = card.get("field") or None, card.get("measure") or None
    by_name = {f["name"]: f["kind"] for f in fields}
    names = {k: sorted(n for n, fk in by_name.items() if fk in ks)
             for k, ks in (("number", NUMERIC), ("choice", CHOICE), ("date", DATE))}
    if kind not in KINDS:
        raise Problem(f"A card's type is one of {list(KINDS)}, not {kind!r}.")
    if kind == "metric":
        if measure not in ("count", "sum", "avg", "estimated"):
            raise Problem("A metric card measures count, sum, avg or estimated.")
        if measure in ("sum", "avg") and field not in names["number"]:
            raise Problem(f"A {measure} card needs a number field: {names['number'] or 'none'}.")
        if measure in ("count", "estimated"):
            field = None
    elif kind == "breakdown":
        if field not in names["choice"]:
            raise Problem(f"A breakdown card needs a choice or status field: "
                          f"{names['choice'] or 'none'}.")
        measure = None
    elif kind == "overtime":
        if field not in names["date"]:
            raise Problem(f"An overtime card needs a date field: {names['date'] or 'none'}.")
        measure = measure or "count"
        if measure != "count" and measure not in names["number"]:
            raise Problem("An overtime card counts records or adds up a number field: "
                          f"{names['number'] or 'none'}.")
    else:
        field = measure = None
    title = str(card.get("title") or "").strip()
    if not title:
        raise Problem("A card needs a title: what it is for, in the person's words.")
    return {"type": kind, "field": field, "measure": measure, "title": title[:80],
            "why": str(card.get("why") or "").strip()[:300]}


def shape_of(table: dict[str, Any]) -> dict[str, Any]:
    """What a table looks like: its fields with their kinds and choices, and whether it has
    rows. Rows coming and going don't change it."""
    return {"fields": {f["name"]: [f["kind"], sorted(map(str, f.get("choices") or []))]
                       for f in table["fields"]},
            "rows": table["records"] > 0}


def what_changed(before: dict[str, Any] | None, after: dict[str, Any]) -> str | None:
    """A change that matters, in words, or None: a new table with rows, its first rows, new
    fields, new choices. Rows coming and going is not one: the cards' numbers follow them."""
    if not after["rows"]:
        return None
    if before is None:
        return "it is new"
    if not before["rows"]:
        return "it has its first rows"
    new = [n for n in after["fields"] if n not in before["fields"]]
    kinds = [n for n in after["fields"] if n in before["fields"]
             and after["fields"][n][0] != before["fields"][n][0]]
    choices = [n for n in after["fields"] if n in before["fields"] and n not in kinds
               and set(after["fields"][n][1]) - set(before["fields"][n][1])]
    words = ([f"new fields: {', '.join(new)}"] if new else []) \
        + ([f"fields of a new kind: {', '.join(kinds)}"] if kinds else []) \
        + ([f"new choices in {', '.join(choices)}"] if choices else [])
    return "; ".join(words) or None


class Cards:
    def __init__(self, store: Store) -> None:
        self.store = store

    def of(self, collection: str) -> list[dict[str, Any]]:
        return [self._row(r) for r in self.store.all(
            "SELECT * FROM cards WHERE collection = ? ORDER BY created_at, id", (collection,))]

    def keep(self, collection: str, cards: list[dict[str, Any]], proposal: str | None
             ) -> list[dict[str, Any]]:
        """Keep the cards the person said yes to; one already kept (the same type, field and
        measure) takes the new title instead of appearing twice."""
        kept = []
        with self.store.tx() as db:
            for c in cards:
                same = db.execute(
                    "SELECT id FROM cards WHERE collection = ? AND type = ? AND"
                    " IFNULL(field, '') = ? AND IFNULL(measure, '') = ?",
                    (collection, c["type"], c["field"] or "", c["measure"] or "")).fetchone()
                cid = same["id"] if same else new_id("card")
                if same:
                    db.execute("UPDATE cards SET title = ?, why = ? WHERE id = ?",
                               (c["title"], c["why"], cid))
                else:
                    db.execute(
                        "INSERT INTO cards (id, collection, type, field, measure, title, why,"
                        " proposal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (cid, collection, c["type"], c["field"], c["measure"], c["title"],
                         c["why"], proposal, now()))
                kept.append({"id": cid, "collection": collection, **c})
        return kept

    def remove(self, cid: str) -> dict[str, Any]:
        with self.store.tx() as db:
            row = db.execute("SELECT * FROM cards WHERE id = ?", (cid,)).fetchone()
            if row is None:
                raise Problem("That card is already gone.")
            db.execute("DELETE FROM cards WHERE id = ?", (cid,))
        return self._row(row)

    def remove_tables(self, db: Any, tables: list[str]) -> int:
        n = 0
        for t in tables:
            n += db.execute("DELETE FROM cards WHERE collection = ?", (t,)).rowcount
            db.execute("DELETE FROM card_shapes WHERE collection = ?", (t,))
        return n

    def shapes(self) -> dict[str, dict[str, Any]]:
        return {r["collection"]: loads(r["shape"], None)
                for r in self.store.all("SELECT collection, shape FROM card_shapes")}

    def saw(self, collection: str, shape: dict[str, Any]) -> None:
        with self.store.tx() as db:
            db.execute("INSERT INTO card_shapes (collection, shape, seen_at) VALUES (?, ?, ?)"
                       " ON CONFLICT(collection) DO UPDATE SET shape = excluded.shape,"
                       " seen_at = excluded.seen_at", (collection, dumps(shape), now()))

    @staticmethod
    def _row(r: Any) -> dict[str, Any]:
        return {k: r[k] for k in ("id", "collection", "type", "field", "measure", "title", "why",
                                  "proposal", "created_at")}

