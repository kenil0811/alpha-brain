"""Collections: the tables Alpha designs per topic. The records in them are the person's data.

A collection has typed fields; values are validated on every write so a table stays usable by
pages, queries and other modules. Writes are compare-and-swap on the record's revision: zero
affected rows is a conflict, never a silent success. A schema may only grow (new optional fields,
wider choices) so saved records never lose meaning.
"""

from __future__ import annotations

import re
import sqlite3
from datetime import date, datetime
from typing import Any

from alpha.world.store import Problem, Store, dumps, fts_query, loads, new_id, now

FIELD_KINDS = {
    "text",
    "long_text",
    "number",
    "date",
    "datetime",
    "bool",
    "choice",
    "multichoice",
    "status",
    "url",
    "relation",
    "file",
}
NAME = re.compile(r"^[a-z][a-z0-9_]{0,47}$")
SYSTEM_FIELDS = {"id", "created_at", "updated_at"}
OPS = {"eq", "ne", "gt", "gte", "lt", "lte", "contains", "in", "is_null"}
AGGREGATES = {"count", "sum", "avg", "min", "max"}


def _check_name(name: str, what: str) -> None:
    if not NAME.match(name):
        raise Problem(
            f"'{name}' can't be a {what} name: use lower-case letters, digits and underscores,"
            " starting with a letter (e.g. food_log)."
        )


def normalise_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not fields:
        raise Problem("A table needs at least one field.")
    seen: set[str] = set()
    out = []
    for raw in fields:
        name = str(raw.get("name", ""))
        _check_name(name, "field")
        if name in SYSTEM_FIELDS:
            raise Problem(f"'{name}' is kept for every record already; pick another field name.")
        if name in seen:
            raise Problem(f"The field '{name}' appears twice.")
        seen.add(name)
        kind = str(raw.get("kind", "text"))
        if kind not in FIELD_KINDS:
            raise Problem(f"'{kind}' is not a field kind; use one of {sorted(FIELD_KINDS)}.")
        field: dict[str, Any] = {"name": name, "kind": kind}
        if raw.get("label"):
            field["label"] = str(raw["label"])
        if raw.get("unit"):
            field["unit"] = str(raw["unit"])
        if raw.get("required"):
            field["required"] = True
        if kind in {"choice", "multichoice", "status"}:
            choices = [str(c) for c in raw.get("choices") or []]
            if not choices:
                raise Problem(f"The {kind} field '{name}' needs its choices.")
            field["choices"] = choices
            if kind == "status" and raw.get("done_choices"):
                field["done_choices"] = [str(c) for c in raw["done_choices"]]
        if kind == "relation":
            target = raw.get("relation")
            if not target:
                raise Problem(
                    f"The relation field '{name}' needs 'relation': a collection name or"
                    " 'entity:person' / 'entity:organisation'."
                )
            field["relation"] = str(target)
        out.append(field)
    return out


def _coerce(field: dict[str, Any], value: Any) -> Any:
    name, kind = field["name"], field["kind"]
    if value is None:
        return None
    try:
        if kind in {"text", "long_text", "url", "relation", "file"}:
            text = str(value)
            if kind == "url" and not re.match(r"^https?://", text):
                raise ValueError("a web address starting with http:// or https://")
            return text
        if kind == "number":
            if isinstance(value, bool):
                raise ValueError("a number")
            number = float(value)
            return int(number) if number.is_integer() else number
        if kind == "bool":
            if isinstance(value, bool):
                return value
            if str(value).lower() in {"true", "yes", "1"}:
                return True
            if str(value).lower() in {"false", "no", "0"}:
                return False
            raise ValueError("true or false")
        if kind == "date":
            return date.fromisoformat(str(value)[:10]).isoformat()
        if kind == "datetime":
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).isoformat()
        if kind in {"choice", "status"}:
            chosen = _choice(field["choices"], value)
            if chosen is None:
                raise ValueError(f"one of {field['choices']}")
            return chosen
        if kind == "multichoice":
            items = [_choice(field["choices"], v)
                     for v in (value if isinstance(value, list) else [value])]
            if None in items:
                raise ValueError(f"values from {field['choices']}")
            return items
    except ValueError as e:
        raise Problem(f"'{name}' must be {e.args[0] if e.args else kind}; got {value!r}.") from e
    return value


TEXTLIKE = {"text", "long_text", "url", "relation"}
KIND_WORDS = {"text": "text", "long_text": "long text", "number": "a number", "date": "a date",
              "datetime": "a date and time", "bool": "yes or no", "choice": "a choice",
              "multichoice": "choices", "status": "a status", "url": "a link",
              "relation": "a link to a record"}


def _label(field: dict[str, Any]) -> str:
    return str(field.get("label") or field["name"].replace("_", " ").capitalize())


def _as_input(value: Any, kind: str) -> Any:
    """A stored value in a shape the new kind can read: yes/no as words, one choice out of a
    list of choices."""
    if isinstance(value, bool) and kind != "bool":
        return "Yes" if value else "No"
    if isinstance(value, list) and kind != "multichoice":
        if len(value) > 1:
            raise ValueError("holds several choices")
        return value[0] if value else None
    return value


def _convert(old: dict[str, Any], new: dict[str, Any], value: Any) -> Any:
    """One saved value as the new kind, or a Problem saying why it can't be without losing what
    it says. Text that parses (a number, a date) is read as what it means; anything else must
    come back unchanged when converted back."""
    try:
        try:
            out = _coerce(new, _as_input(value, new["kind"]))
        except Problem as e:
            choice = new["kind"] in {"choice", "multichoice", "status"}
            raise ValueError(f"isn't {'one of its choices' if choice else KIND_WORDS[new['kind']]}"
                             ) from e
        if old["kind"] == "long_text" and new["kind"] != "long_text" and "\n" in str(value):
            raise ValueError("has several lines")
        if old["kind"] not in TEXTLIKE or new["kind"] in TEXTLIKE:
            try:
                back = _coerce(old, _as_input(out, old["kind"]))
            except (Problem, ValueError):
                back = None
            if back != value:
                raise ValueError(f"would read {out!r}")
    except ValueError as e:
        raise Problem(f"{_label(old)} can't become {KIND_WORDS[new['kind']]}: a row holds"
                      f" {value!r}, which {e.args[0]}.") from e
    return out
def _choice(choices: list[str], value: Any) -> str | None:
    """The declared choice a value means, regardless of case and spacing ("PENDING" is
    "Pending"); None when it is none of them."""
    want = " ".join(str(value).split()).casefold()
    return next((c for c in choices if " ".join(c.split()).casefold() == want), None)


def _search_text(values: dict[str, Any]) -> str:
    parts = []
    for v in values.values():
        if isinstance(v, str):
            parts.append(v)
        elif isinstance(v, list):
            parts.extend(str(x) for x in v)
    return " ".join(parts)


ROWS_ARE = {"person", "organisation"}


def _check_identity(identity: dict[str, str], names: list[str]) -> dict[str, str]:
    rows_are, field = identity.get("rows_are"), identity.get("field")
    if rows_are not in ROWS_ARE:
        raise Problem(f"Rows can be {sorted(ROWS_ARE)}; got '{rows_are}'.")
    if field not in names:
        raise Problem(f"The identity field '{field}' is not one of the fields {names}.")
    return {"rows_are": str(rows_are), "field": str(field)}
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
URL = re.compile(r"^https?://\S+$", re.I)


def hard_key(value: Any) -> tuple[str, str] | None:
    """The identifying key a value is, if it is one: an email address or a web address. A name
    alone never is (two people share names; a wrong merge poisons what links to it)."""
    text = str(value or "").strip()
    if EMAIL.match(text):
        return "email", text
    if URL.match(text):
        return "url", text
    return None


def record_view(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "revision": row["revision"],
        **loads(row["values"], {}),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "_provenance": loads(row["provenance"], {}),
        **({"_entity": row["entity_id"]} if row["entity_id"] else {}),
        **({"_seen_at": row["seen_at"]} if row["seen_at"] else {}),
        **({"_gone_at": row["gone_at"]} if row["gone_at"] else {}),
    }


class Collections:
    """The person's tables. A table can say its rows are people or organisations, naming the
    field that identifies each (an email or a profile address): every write then links the row
    to that entity in the registry by that hard key, with no model call. Every change keeps the
    record's previous values in `record_versions`."""

    def __init__(self, store: Store, entities: Any = None) -> None:
        self.store = store
        self.entities = entities

    # ---- tables ----

    def create(
        self,
        name: str,
        title: str,
        fields: list[dict[str, Any]],
        *,
        module: str | None = None,
        title_field: str | None = None,
        identity: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        _check_name(name, "table")
        if self.store.one("SELECT 1 FROM collections WHERE name = ?", (name,)):
            raise Problem(f"A table named '{name}' exists already; describe it or add fields.")
        schema: dict[str, Any] = {"fields": normalise_fields(fields)}
        names = [f["name"] for f in schema["fields"]]
        if title_field is None:
            title_field = next(
                (f["name"] for f in schema["fields"] if f["kind"] == "text"), names[0]
            )
        elif title_field not in names:
            raise Problem(f"The title field '{title_field}' is not one of the fields {names}.")
        if identity:
            schema["identity"] = _check_identity(identity, names)
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO collections (name, module, title, schema, title_field, created_at,"
                " updated_at) VALUES (?,?,?,?,?,?,?)",
                (name, module, title, dumps(schema), title_field, stamp, stamp),
            )
        return self.describe(name)

    def add_fields(self, name: str, fields: list[dict[str, Any]]) -> dict[str, Any]:
        """Grow a table. New fields are optional, so existing records stay valid."""
        current = self._schema(name)
        existing = {f["name"] for f in current["fields"]}
        added = normalise_fields(fields)
        for f in added:
            if f["name"] in existing:
                raise Problem(f"'{name}' already has a field '{f['name']}'.")
            f.pop("required", None)
        current["fields"].extend(added)
        with self.store.tx() as db:
            db.execute(
                "UPDATE collections SET schema = ?, updated_at = ? WHERE name = ?",
                (dumps(current), now(), name),
            )
        return self.describe(name)

    def change_field(
        self, name: str, field: str, *, kind: str | None = None, label: str | None = None,
        choices: list[str] | None = None, relation: str | None = None,
    ) -> dict[str, Any]:
        """Change one field in place: its label, its choices, or its kind. Every saved value is
        converted to the new kind first; if any one would lose what it says (a word that isn't
        a number, a time of day a date can't hold, a choice being taken away that rows use) the
        change is refused with the reason and nothing is touched. Returns the field before and
        after, and how many rows were rewritten."""
        schema = self._schema(name)
        at = next((i for i, f in enumerate(schema["fields"]) if f["name"] == field), None)
        if at is None:
            raise Problem(f"'{name}' has no field '{field}'.")
        old = schema["fields"][at]
        new_kind = kind or old["kind"]
        raw: dict[str, Any] = {"name": field, "kind": new_kind, "label": old.get("label"),
                               "unit": old.get("unit"), "required": old.get("required")}
        if label is not None:
            raw["label"] = label.strip() or None
        if new_kind == "relation":
            raw["relation"] = relation or old.get("relation")
        rows = self.store.all(
            'SELECT id, "values" FROM records WHERE collection = ? AND deleted_at IS NULL',
            (name,))
        held = [(r["id"], loads(r["values"], {})) for r in rows]
        used = [v[field] for _, v in held if v.get(field) not in (None, "", [])]
        if new_kind in {"choice", "multichoice", "status"}:
            if choices is not None:
                raw["choices"] = choices
            elif old["kind"] in {"choice", "multichoice", "status"}:
                raw["choices"] = old["choices"]
            else:  # the values already in the table become its choices
                seen = sorted({str(x) for v in used for x in (v if isinstance(v, list) else [v])})
                if len(seen) > 50:
                    raise Problem(f"{_label(old)} holds {len(seen)} different values; too many"
                                  " to become choices.")
                raw["choices"] = seen or None
            if new_kind == "status":
                raw["done_choices"] = [c for c in old.get("done_choices") or []
                                       if c in (raw.get("choices") or [])]
        new = normalise_fields([{k: v for k, v in raw.items() if v is not None}])[0]
        if new == old:
            return {"before": old, "after": old, "rewritten": 0, "table": self.describe(name)}
        changed: list[tuple[str, dict[str, Any]]] = []
        for rid, values in held:
            value = values.get(field)
            if value in (None, "", []):
                continue
            converted = _convert(old, new, value)
            if converted != value:
                changed.append((rid, {**values, field: converted}))
        schema["fields"][at] = new
        stamp = now()
        with self.store.tx() as db:
            for rid, values in changed:
                self._keep(db, name, rid)
                db.execute(
                    'UPDATE records SET "values" = ?, revision = revision + 1'
                    " WHERE collection = ? AND id = ?", (dumps(values), name, rid))
                db.execute("DELETE FROM records_fts WHERE collection = ? AND record_id = ?",
                           (name, rid))
                db.execute("INSERT INTO records_fts (collection, record_id, text) VALUES (?,?,?)",
                           (name, rid, _search_text(values)))
            db.execute("UPDATE collections SET schema = ?, updated_at = ? WHERE name = ?",
                       (dumps(schema), stamp, name))
        return {"before": old, "after": new, "rewritten": len(changed),
                "table": self.describe(name)}
    def identify(self, name: str, rows_are: str, field: str) -> dict[str, Any]:
        """Say that each row of a table is a person or an organisation, identified by `field`;
        rows already there are linked now."""
        current = self._schema(name)
        current["identity"] = _check_identity({"rows_are": rows_are, "field": field},
                                              [f["name"] for f in current["fields"]])
        with self.store.tx() as db:
            db.execute("UPDATE collections SET schema = ?, updated_at = ? WHERE name = ?",
                       (dumps(current), now(), name))
        linked = 0
        for row in self.store.all(
            "SELECT id, \"values\" FROM records WHERE collection = ? AND deleted_at IS NULL"
            " AND entity_id IS NULL", (name,)
        ):
            if self._link(name, row["id"], loads(row["values"], {})):
                linked += 1
        return {**self.describe(name), "linked": linked}

    def _identity(self, name: str) -> dict[str, str] | None:
        identity: dict[str, str] | None = self._schema(name).get("identity")
        return identity

    def _link(self, name: str, rid: str, values: dict[str, Any],
              identity: dict[str, str] | None = None) -> str | None:
        """Link one row to the entity its identity field names; None when it names none."""
        identity = identity or self._identity(name)
        if not identity or self.entities is None:
            return None
        key = hard_key(values.get(identity["field"]))
        if key is None:
            return None
        title_field = self.store.one("SELECT title_field FROM collections WHERE name = ?",
                                     (name,))
        label = values.get(title_field["title_field"]) if title_field else None
        entity = self.entities.resolve(identity["rows_are"], str(label or key[1]),
                                       {key[0]: key[1]}, source=f"record:{name}/{rid}")["entity"]
        with self.store.tx() as db:
            db.execute("UPDATE records SET entity_id = ? WHERE collection = ? AND id = ?",
                       (entity["id"], name, rid))
        return str(entity["id"])

    def linked_to(self, entity_id: str) -> list[dict[str, Any]]:
        """The rows, in any table, that are this entity."""
        ids = [entity_id] + [r["id"] for r in self.store.all(
            "SELECT id FROM entities WHERE merged_into = ?", (entity_id,))]
        marks = ",".join("?" * len(ids))
        return [{"collection": r["collection"], "id": r["id"], **loads(r["values"], {})}
                for r in self.store.all(
                    "SELECT collection, id, \"values\" FROM records"
                    f" WHERE entity_id IN ({marks}) AND deleted_at IS NULL", tuple(ids))]

    @staticmethod
    def _keep(db: sqlite3.Connection, name: str, rid: str) -> None:
        """Keep a record's current values before they change."""
        db.execute(
            "INSERT OR IGNORE INTO record_versions (collection, record_id, revision,"
            " \"values\", provenance, replaced_at) SELECT collection, id, revision,"
            " \"values\", provenance, ? FROM records WHERE collection = ? AND id = ?",
            (now(), name, rid),
        )

    def history(self, name: str, rid: str) -> list[dict[str, Any]]:
        """What a record was before each change, newest first."""
        return [{"revision": r["revision"], "values": loads(r["values"], {}),
                 "by": loads(r["provenance"], {}), "until": r["replaced_at"]}
                for r in self.store.all(
                    "SELECT * FROM record_versions WHERE collection = ? AND record_id = ?"
                    " ORDER BY revision DESC", (name, rid))]

    def describe(self, name: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM collections WHERE name = ?", (name,))
        if row is None:
            raise Problem(f"There is no table '{name}'. Existing tables: {self.names()}.")
        count = self.store.one(
            "SELECT COUNT(*) AS n FROM records WHERE collection = ? AND deleted_at IS NULL",
            (name,),
        )
        return {
            "name": row["name"],
            "title": row["title"],
            "module": row["module"],
            "title_field": row["title_field"],
            "fields": loads(row["schema"])["fields"],
            **({"identity": loads(row["schema"])["identity"]}
               if "identity" in loads(row["schema"]) else {}),
            "records": count["n"] if count else 0,
            "created_at": row["created_at"],
        }

    def names(self) -> list[str]:
        return [r["name"] for r in self.store.all("SELECT name FROM collections ORDER BY name")]

    def overview(self, module: str | None = None) -> list[dict[str, Any]]:
        rows = self.store.all(
            "SELECT c.name, c.title, c.module, COUNT(r.id) AS n FROM collections c"
            " LEFT JOIN records r ON r.collection = c.name AND r.deleted_at IS NULL"
            + (" WHERE c.module = ?" if module is not None else "")
            + " GROUP BY c.name ORDER BY c.module, c.name",
            (module,) if module is not None else (),
        )
        return [
            {"name": r["name"], "title": r["title"], "module": r["module"], "records": r["n"]}
            for r in rows
        ]

    def _schema(self, name: str) -> dict[str, Any]:
        row = self.store.one("SELECT schema FROM collections WHERE name = ?", (name,))
        if row is None:
            raise Problem(f"There is no table '{name}'. Existing tables: {self.names()}.")
        schema: dict[str, Any] = loads(row["schema"])
        return schema

    def _validate(
        self, name: str, values: dict[str, Any], *, partial: bool
    ) -> dict[str, Any]:
        fields = {f["name"]: f for f in self._schema(name)["fields"]}
        unknown = [k for k in values if k not in fields]
        if unknown:
            raise Problem(
                f"'{name}' has no field {unknown}; its fields are {list(fields)}."
                " Add a field first if it is needed."
            )
        clean = {k: _coerce(fields[k], v) for k, v in values.items()}
        if not partial:
            missing = [f for f, spec in fields.items() if spec.get("required") and
                       clean.get(f) in (None, "", [])]
            if missing:
                raise Problem(f"'{name}' needs {missing} for every record.")
        return clean

    # ---- records ----

    def add(
        self, name: str, values: dict[str, Any], provenance: dict[str, Any]
    ) -> dict[str, Any]:
        clean = self._validate(name, values, partial=False)
        rid = new_id("r")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                'INSERT INTO records (collection, id, revision, "values", provenance, created_at,'
                " updated_at) VALUES (?,?,?,?,?,?,?)",
                (name, rid, 1, dumps(clean), dumps(provenance), stamp, stamp),
            )
            db.execute(
                "INSERT INTO records_fts (collection, record_id, text) VALUES (?,?,?)",
                (name, rid, _search_text(clean)),
            )
        self._link(name, rid, clean)
        return self.get(name, rid)

    def upsert(
        self, name: str, key: str, rows: list[dict[str, Any]], provenance: dict[str, Any],
        *, fill_only: set[str] | None = None, seen_by: str | None = None,
        mark_gone: bool = True,
    ) -> dict[str, Any]:
        """Add or update many records at once, matching on `key` (e.g. a URL). A record whose
        values didn't change is left alone. Fields in `fill_only` are written only where the
        record has no value yet, so the person's own edits (tags, notes) are never overwritten.
        Rows that don't fit the table are set aside, counted as `invalid` with the first few
        reasons in `problems`, and the rest are saved. With `seen_by` (a reader's name), every
        row the reader returned is marked seen now, and the reader's rows it didn't return are
        marked gone (`gone`); a row that comes back is no longer gone. Returns counts and the
        ids touched."""
        schema = self._schema(name)
        identity = schema.get("identity")
        fields = {f["name"] for f in schema["fields"]}
        if key not in fields:
            raise Problem(f"'{name}' has no field '{key}' to match records on.")
        counts = {"added": 0, "updated": 0, "unchanged": 0, "skipped": 0, "invalid": 0}
        touched: list[str] = []
        seen_ids: list[str] = []
        seen: set[str] = set()
        stamp = now()
        problems: list[str] = []
        to_link: list[tuple[str, dict[str, Any]]] = []
        # One transaction for the whole batch, and the existing keys are read inside it: the
        # write lock is held from that read to the last write, so two runs saving the same
        # list at once (a build and an automation) cannot both add a row for one key, and a
        # crash leaves the table as it was (found by the 3 Oct review).
        with self.store.tx() as db:
            existing: dict[str, sqlite3.Row] = {}
            for row in db.execute(
                'SELECT * FROM records WHERE collection = ? AND deleted_at IS NULL', (name,)
            ).fetchall():
                value = loads(row["values"], {}).get(key)
                if value is not None:
                    existing[str(value)] = row
            for raw in rows:
                match = raw.get(key)
                if match in (None, "") or str(match) in seen:
                    counts["skipped"] += 1
                    continue
                seen.add(str(match))
                prior = existing.get(str(match))
                # One bad row never sinks the batch: it is set aside and reported.
                try:
                    clean = self._validate(name, raw, partial=prior is not None)
                except Problem as e:
                    counts["invalid"] += 1
                    if len(problems) < 5:
                        problems.append(f"{match}: {e}")
                    if prior is not None:
                        seen_ids.append(prior["id"])  # still there on the page, just not saved
                    continue
                if prior is None:
                    rid = new_id("r")
                    db.execute(
                        'INSERT INTO records (collection, id, revision, "values", provenance,'
                        " created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                        (name, rid, 1, dumps(clean), dumps(provenance), stamp, stamp),
                    )
                    db.execute(
                        "INSERT INTO records_fts (collection, record_id, text) VALUES (?,?,?)",
                        (name, rid, _search_text(clean)),
                    )
                    counts["added"] += 1
                    touched.append(rid)
                    seen_ids.append(rid)
                    to_link.append((rid, clean))
                    continue
                current = loads(prior["values"], {})
                merged = dict(current)
                for k, v in clean.items():
                    if fill_only and k in fill_only and current.get(k) not in (None, "", []):
                        continue
                    merged[k] = v
                seen_ids.append(prior["id"])
                if merged == current:
                    counts["unchanged"] += 1
                    if identity and not prior["entity_id"]:
                        to_link.append((prior["id"], current))
                    continue
                self._keep(db, name, prior["id"])
                db.execute(
                    'UPDATE records SET "values" = ?, revision = revision + 1, provenance = ?,'
                    " updated_at = ? WHERE collection = ? AND id = ?",
                    (dumps(merged), dumps(provenance), stamp, name, prior["id"]),
                )
                db.execute(
                    "DELETE FROM records_fts WHERE collection = ? AND record_id = ?",
                    (name, prior["id"]),
                )
                db.execute(
                    "INSERT INTO records_fts (collection, record_id, text) VALUES (?,?,?)",
                    (name, prior["id"], _search_text(merged)),
                )
                counts["updated"] += 1
                touched.append(prior["id"])
                to_link.append((prior["id"], merged))
        if identity:
            for rid, values in to_link:
                self._link(name, rid, values, identity)
        if seen_by:
            counts["gone"] = self._seen(name, seen_by, seen_ids, stamp, mark_gone=mark_gone)
        return {**counts, "ids": touched, "problems": problems}

    def _seen(self, name: str, reader: str, ids: list[str], stamp: str, *,
              mark_gone: bool = True) -> int:
        """Mark what a reader's run returned as seen, and (for a reader that returns its whole
        list) its rows it didn't return as gone."""
        with self.store.tx() as db:
            for i in range(0, len(ids), 500):
                chunk = ids[i:i + 500]
                db.execute(
                    "UPDATE records SET reader = ?, seen_at = ?, gone_at = NULL"
                    f" WHERE collection = ? AND id IN ({','.join('?' * len(chunk))})",
                    (reader, stamp, name, *chunk),
                )
            if not mark_gone:
                return 0
            gone: int = db.execute(
                "UPDATE records SET gone_at = ? WHERE collection = ? AND reader = ?"
                " AND (seen_at IS NULL OR seen_at < ?) AND gone_at IS NULL"
                " AND deleted_at IS NULL", (stamp, name, reader, stamp),
            ).rowcount
        return gone

    def held_by(self, name: str, reader: str) -> int:
        """How many rows of a table a reader returned last time and are still there."""
        row = self.store.one(
            "SELECT COUNT(*) AS n FROM records WHERE collection = ? AND reader = ?"
            " AND gone_at IS NULL AND deleted_at IS NULL", (name, reader),
        )
        return int(row["n"]) if row else 0

    def changes(self, name: str, since: str, where: dict[str, Any] | None = None
                ) -> dict[str, list[dict[str, Any]]]:
        """What happened to a table's rows since a moment: new rows, rows whose values
        changed, rows gone. `where` narrows it to the rows that matter."""
        allowed = {r["id"] for r in self.query(name, where, limit=None)} if where else None
        new, changed, gone = [], [], []
        for row in self.store.all(
            "SELECT * FROM records WHERE collection = ? AND deleted_at IS NULL", (name,)
        ):
            if allowed is not None and row["id"] not in allowed:
                continue
            view = record_view(row)
            if row["gone_at"] and row["gone_at"] >= since:
                gone.append(view)
            elif row["created_at"] >= since:
                new.append(view)
            elif self.store.one(
                "SELECT 1 FROM record_versions WHERE collection = ? AND record_id = ?"
                " AND replaced_at >= ?", (name, row["id"], since),
            ):
                changed.append(view)
        return {"new": new, "changed": changed, "gone": gone}

    def get(self, name: str, rid: str) -> dict[str, Any]:
        row = self.store.one(
            "SELECT * FROM records WHERE collection = ? AND id = ? AND deleted_at IS NULL",
            (name, rid),
        )
        if row is None:
            raise Problem(f"There is no record {rid} in '{name}'.")
        return record_view(row)

    def update(
        self,
        name: str,
        rid: str,
        values: dict[str, Any],
        revision: int,
        provenance: dict[str, Any],
    ) -> dict[str, Any]:
        clean = self._validate(name, values, partial=True)
        current = self.get(name, rid)
        merged = {k: v for k, v in current.items() if k not in SYSTEM_FIELDS | {"revision",
                                                                                "_provenance"}}
        merged = {k: v for k, v in merged.items() if not k.startswith("_")}
        merged.update(clean)
        with self.store.tx() as db:
            self._keep(db, name, rid)
            cur = db.execute(
                'UPDATE records SET "values" = ?, revision = revision + 1, provenance = ?,'
                " updated_at = ? WHERE collection = ? AND id = ? AND revision = ?"
                " AND deleted_at IS NULL",
                (dumps(merged), dumps(provenance), now(), name, rid, revision),
            )
            if cur.rowcount == 0:
                raise Problem(
                    f"Record {rid} changed since revision {revision}; read it again and retry."
                )
            db.execute(
                "DELETE FROM records_fts WHERE collection = ? AND record_id = ?", (name, rid)
            )
            db.execute(
                "INSERT INTO records_fts (collection, record_id, text) VALUES (?,?,?)",
                (name, rid, _search_text(merged)),
            )
        self._link(name, rid, merged)
        return self.get(name, rid)

    def delete(self, name: str, rid: str, revision: int) -> None:
        with self.store.tx() as db:
            self._keep(db, name, rid)
            cur = db.execute(
                "UPDATE records SET deleted_at = ? WHERE collection = ? AND id = ?"
                " AND revision = ? AND deleted_at IS NULL",
                (now(), name, rid, revision),
            )
            if cur.rowcount == 0:
                raise Problem(
                    f"Record {rid} changed since revision {revision} or is gone; read it again."
                )
            db.execute(
                "DELETE FROM records_fts WHERE collection = ? AND record_id = ?", (name, rid)
            )

    def restore(self, name: str, rid: str, provenance: dict[str, Any]) -> dict[str, Any]:
        """Bring back a removed record (undo). Values that no longer fit the table (a field
        changed kind since) are dropped from it, never forced in."""
        row = self.store.one(
            "SELECT * FROM records WHERE collection = ? AND id = ? AND deleted_at IS NOT NULL",
            (name, rid))
        if row is None:
            raise Problem(f"Record {rid} in '{name}' isn't removed; nothing to bring back.")
        fields = {f["name"]: f for f in self._schema(name)["fields"]}
        values: dict[str, Any] = {}
        for k, v in loads(row["values"], {}).items():
            try:
                values[k] = _coerce(fields[k], v) if k in fields else None
            except Problem:
                continue
        values = {k: v for k, v in values.items() if k in fields}
        with self.store.tx() as db:
            db.execute(
                'UPDATE records SET deleted_at = NULL, "values" = ?, revision = revision + 1,'
                " provenance = ?, updated_at = ? WHERE collection = ? AND id = ?",
                (dumps(values), dumps(provenance), now(), name, rid))
            db.execute("INSERT INTO records_fts (collection, record_id, text) VALUES (?,?,?)",
                       (name, rid, _search_text(values)))
        return self.get(name, rid)

    # ---- reading ----

    def _where(
        self, name: str, where: dict[str, Any] | None
    ) -> tuple[str, list[Any]]:
        fields = {f["name"]: f for f in self._schema(name)["fields"]}
        clauses = ["collection = ?", "deleted_at IS NULL"]
        args: list[Any] = [name]
        for key, cond in (where or {}).items():
            if key in {"created_at", "updated_at"}:
                expr = key
            elif key in fields:
                expr = f"json_extract(\"values\", '$.{key}')"
            else:
                raise Problem(f"'{name}' has no field '{key}' to filter on.")
            conds = cond if isinstance(cond, dict) else {"eq": cond}
            for op, value in conds.items():
                if op not in OPS:
                    raise Problem(f"'{op}' is not a filter; use one of {sorted(OPS)}.")
                if op == "is_null":
                    clauses.append(f"{expr} IS {'NULL' if value else 'NOT NULL'}")
                elif op == "contains":
                    clauses.append(f"LOWER({expr}) LIKE ?")
                    args.append(f"%{str(value).lower()}%")
                elif op == "in":
                    items = value if isinstance(value, list) else [value]
                    clauses.append(f"{expr} IN ({','.join('?' * len(items))})")
                    args.extend(items)
                else:
                    sql_op = {"eq": "=", "ne": "!=", "gt": ">", "gte": ">=", "lt": "<",
                              "lte": "<="}[op]
                    clauses.append(f"{expr} {sql_op} ?")
                    args.append(value)
        return " AND ".join(clauses), args

    def query(
        self,
        name: str,
        where: dict[str, Any] | None = None,
        order: str | None = None,
        limit: int | None = 50,
    ) -> list[dict[str, Any]]:
        """Rows that match, newest first unless `order` says otherwise. The model reads at most
        500 at a time; `limit=None` is every row, for the person's own page of the table."""
        clause, args = self._where(name, where)
        fields = {f["name"] for f in self._schema(name)["fields"]}
        order_sql = "created_at DESC"
        if order:
            desc = order.startswith("-")
            key = order.lstrip("-")
            if key in {"created_at", "updated_at"}:
                col = key
            elif key in fields:
                col = f"json_extract(\"values\", '$.{key}')"
            else:
                raise Problem(f"'{name}' has no field '{key}' to sort by.")
            order_sql = f"{col} {'DESC' if desc else 'ASC'}"
        sql = f"SELECT * FROM records WHERE {clause} ORDER BY {order_sql}"
        if limit is not None:
            sql += " LIMIT ?"
            args.append(max(1, min(limit, 500)))
        rows = self.store.all(sql, tuple(args))
        return [record_view(r) for r in rows]

    def aggregate(
        self,
        name: str,
        op: str,
        field: str | None = None,
        where: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if op not in AGGREGATES:
            raise Problem(f"'{op}' is not an aggregate; use one of {sorted(AGGREGATES)}.")
        clause, args = self._where(name, where)
        if op == "count":
            row = self.store.one(f"SELECT COUNT(*) AS v FROM records WHERE {clause}", tuple(args))
            return {"op": op, "value": row["v"] if row else 0}
        fields = {f["name"]: f for f in self._schema(name)["fields"]}
        if field not in fields or fields[field]["kind"] != "number":
            raise Problem(f"'{op}' needs a number field of '{name}'; got {field!r}.")
        row = self.store.one(
            f"SELECT {op.upper()}(CAST(json_extract(\"values\", '$.{field}') AS REAL)) AS v,"
            f" COUNT(*) AS n FROM records WHERE {clause}",
            tuple(args),
        )
        value = row["v"] if row else None
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        elif isinstance(value, float):
            value = round(value, 2)
        return {"op": op, "field": field, "value": value, "records": row["n"] if row else 0}

    def search(self, text: str, limit: int = 10) -> list[dict[str, Any]]:
        query = fts_query(text)
        if query is None:
            return []
        rows = self.store.all(
            "SELECT f.collection, f.record_id, snippet(records_fts, 2, '[', ']', '…', 12) AS snip,"
            " r.updated_at FROM records_fts f JOIN records r ON r.collection = f.collection"
            " AND r.id = f.record_id WHERE records_fts MATCH ? AND r.deleted_at IS NULL"
            " ORDER BY bm25(records_fts), r.updated_at DESC LIMIT ?",
            (query, max(1, min(limit, 100))),
        )
        return [
            {"collection": r["collection"], "id": r["record_id"], "snippet": r["snip"],
             "updated_at": r["updated_at"]}
            for r in rows
        ]
