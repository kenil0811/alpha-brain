"""Collections: the tables Alpha designs per topic. The records in them are the person's data.

A collection has typed fields; values are validated on every write so a table stays usable by
pages, queries and other modules. Writes are compare-and-swap on the record's revision: zero
affected rows is a conflict, never a silent success. A schema may only grow (new optional fields,
wider choices) so saved records never lose meaning.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Callable
from datetime import date, datetime
from typing import Any, Protocol

from alpha.world.names import check_name
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
SYSTEM_FIELDS = {"id", "created_at", "updated_at"}
OPS = {"eq", "ne", "gt", "gte", "lt", "lte", "contains", "in", "is_null"}
AGGREGATES = {"count", "sum", "avg", "min", "max"}


def _check_name(name: str, what: str) -> None:
    check_name(name, what, "food_log")


def _label_of(field: dict[str, Any]) -> str:
    """A field's name for the eye, as the window shows it: its label, else its id in words."""
    label = field.get("label")
    if label and label != field["name"]:
        return str(label)
    words = str(field["name"]).replace("_", " ").strip()
    return words[:1].upper() + words[1:]


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
                    f"The relation field '{name}' needs 'relation': a collection name,"
                    " 'entity:person' / 'entity:organisation', or 'any' (a row of any table or"
                    " anyone, as table/id or entity:id)."
                )
            field["relation"] = str(target)
            if raw.get("many"):
                # several at once (a task's references, 18 Oct 2026, P1): a list of the same
                field["many"] = True
        out.append(field)
    return out


def _coerce(field: dict[str, Any], value: Any) -> Any:
    name, kind = field["name"], field["kind"]
    if value is None:
        return None
    try:
        if kind == "relation" and field.get("many"):
            items = value if isinstance(value, list) else [value]
            refs = [" ".join(str(v).split()) for v in items if v is not None]
            return [r for i, r in enumerate(refs) if r and r not in refs[:i]]
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


# what a table's rows can be: people, organisations, or interactions with people (a message,
# a call; P8): an interaction's row links to the person it was with
ROWS_ARE = {"person", "organisation", "interaction"}


class TableHook(Protocol):
    """A table the world itself keeps (the tasks, 18 Oct 2026, P1) shapes its rows on every
    write and follows what a write changed, inside the write's own transaction, so what code
    owes the row (a default, a check, the next of a repeating task) never lags behind it."""

    def shape(self, values: dict[str, Any], before: dict[str, Any] | None,
              provenance: dict[str, Any]) -> dict[str, Any]: ...

    def changed(self, db: sqlite3.Connection, rid: str, before: dict[str, Any] | None,
                after: dict[str, Any]) -> None: ...


# A record removed, inside the removal's transaction: what lives on it goes with it.
RemovalListener = Callable[[sqlite3.Connection, str, str], None]


def _field_list(raw: Any) -> list[str]:
    """Fields named as a list or as "email, phone"."""
    items = raw if isinstance(raw, list) else str(raw or "").split(",")
    return [str(f).strip() for f in items if str(f).strip()]


def _check_identity(identity: dict[str, Any], names: list[str]) -> dict[str, Any]:
    """What identifies a table's rows (P8, Q97): the fields any of whose values names the
    person or organisation for sure (an email, a phone, a profile address), and for people the
    field naming their organisation, when there is one."""
    rows_are = identity.get("rows_are")
    if rows_are not in ROWS_ARE:
        raise Problem(f"Rows can be {sorted(ROWS_ARE)}; got '{rows_are}'.")
    fields = _field_list(identity.get("fields") or identity.get("field"))
    if not fields:
        raise Problem("Say which field identifies each row for sure (an email address, a phone"
                      " or a profile address).")
    for field in fields:
        if field not in names:
            raise Problem(f"The identity field '{field}' is not one of the fields {names}.")
    out: dict[str, Any] = {"rows_are": str(rows_are), "field": fields[0], "fields": fields}
    if rows_are == "interaction":
        # when it happened, and (if the table says) who started it
        for part, words in (("date", "date"), ("direction", "direction")):
            value = identity.get(part)
            if value and value not in names:
                raise Problem(f"The {words} field '{value}' is not one of the fields {names}.")
            if value:
                out[part] = str(value)
        if "date" not in out:
            raise Problem("An interaction needs the field that says when it happened (a date).")
    organisation = identity.get("organisation")
    if organisation:
        if organisation not in names:
            raise Problem(f"The organisation field '{organisation}' is not one of the fields"
                          f" {names}.")
        out["organisation"] = str(organisation)
    return out
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
URL = re.compile(r"^https?://\S+$", re.I)
PHONE = re.compile(r"^\+?[\d\s().\-/]{7,}$")


def hard_key(value: Any) -> tuple[str, str] | None:
    """The identifying key a value is, if it is one: an email address, a web address, or (in a
    field said to identify the row) a phone number. A name alone never is (two people share
    names; a wrong merge poisons what links to it)."""
    text = str(value or "").strip()
    if EMAIL.match(text):
        return "email", text
    if URL.match(text):
        return "url", text
    if PHONE.match(text) and sum(ch.isdigit() for ch in text) >= 7:
        return "phone", text
    return None


def carry_fields(prior: dict[str, Any], provenance: dict[str, Any],
                 changed: set[str]) -> dict[str, Any]:
    """A changed row's provenance: a value's own source (P5; the person's edit, a cell, a part's
    fill) stays with it until that value changes, and the new write's own sources join them."""
    kept = {f: e for f, e in (prior.get("fields") or {}).items() if f not in changed}
    fields = {**kept, **(provenance.get("fields") or {})}
    out = {k: v for k, v in provenance.items() if k != "fields"}
    return {**out, "fields": fields} if fields else out


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
        self.hooks: dict[str, TableHook] = {}
        self.on_remove: list[RemovalListener] = []

    # ---- tables ----

    def _check_title(self, title: str, module: str | None) -> None:
        """A table's title never repeats its module's name or a sibling table's title (13 Oct,
        slice 2 A2: "Deals › Deals"); a table elsewhere may share it."""
        clean = title.strip().lower()
        if module:
            row = self.store.one("SELECT name FROM modules WHERE id = ?", (module,))
            if row and row["name"].strip().lower() == clean:
                raise Problem(f"'{title}' is the module's own name; give the table a name of its"
                              " own (what its rows are, e.g. 'Listings').")
        if self.store.one("SELECT 1 FROM collections WHERE module IS ? AND LOWER(TRIM(title)) = ?",
                          (module, clean)):
            raise Problem(f"There is a table called '{title}' here already; give this one another"
                          " name.")

    def create(
        self,
        name: str,
        title: str,
        fields: list[dict[str, Any]],
        *,
        module: str | None = None,
        title_field: str | None = None,
        identity: dict[str, Any] | None = None,
        world_own: bool = False,
    ) -> dict[str, Any]:
        """A table. `world_own` marks one the world keeps itself (the tasks, P1): never a
        module's, never listed among the person's loose tables, its fields Alpha's."""
        _check_name(name, "table")
        if self.store.one("SELECT 1 FROM collections WHERE name = ?", (name,)):
            raise Problem(f"A table named '{name}' exists already; describe it or add fields.")
        self._check_title(title, module)
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
        if world_own:
            schema["world"] = True
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

    def add_field(self, name: str, label: str, kind: str, *, choices: list[str] | None = None,
                  done_choices: list[str] | None = None, relation: str | None = None,
                  unit: str | None = None) -> dict[str, Any]:
        """A field the person adds (13 Oct, slice 2 B1): named by its label in their words, the
        id made from it; optional, so the rows already there read as empty. Refused when its
        label is one the table has."""
        clean = label.strip()
        if not clean:
            raise Problem("A field needs a name.")
        current = self._schema(name)
        if clean.lower() in {_label_of(f).lower() for f in current["fields"]}:
            raise Problem(f"This table has a field called '{clean}' already.")
        taken = {f["name"] for f in current["fields"]} | SYSTEM_FIELDS
        base = re.sub(r"[^a-z0-9]+", "_", clean.lower()).strip("_")[:40] or "field"
        if not base[0].isalpha():
            base = f"f_{base}"
        fid, n = base, 2
        while fid in taken:
            fid, n = f"{base}_{n}", n + 1
        field: dict[str, Any] = {"name": fid, "label": clean, "kind": kind}
        if choices:
            field["choices"] = [c.strip() for c in choices if c.strip()]
        if done_choices:
            field["done_choices"] = [c.strip() for c in done_choices if c.strip()]
        if relation:
            field["relation"] = relation
        if unit and unit.strip():
            field["unit"] = unit.strip()
        return self.add_fields(name, [field])

    def relabel_field(self, name: str, field: str, label: str) -> dict[str, Any]:
        """A field's name for the eye, changed by the person (13 Oct, slice 2 B2): its label,
        shown in the table, its record pages, filters and lists; its id, which the rows, lists
        and colours keep, stays."""
        clean = label.strip()
        if not clean:
            raise Problem("A field needs a name.")
        current = self._schema(name)
        hit = next((f for f in current["fields"] if f["name"] == field), None)
        if hit is None:
            raise Problem(f"'{name}' has no field '{field}'.")
        if clean.lower() in {_label_of(f).lower() for f in current["fields"] if f is not hit}:
            raise Problem(f"This table has a field called '{clean}' already.")
        hit["label"] = clean
        with self.store.tx() as db:
            db.execute("UPDATE collections SET schema = ?, updated_at = ? WHERE name = ?",
                       (dumps(current), now(), name))
        return self.describe(name)

    def identify(self, name: str, rows_are: str, field: str | list[str],
                 organisation: str | None = None, *, date: str | None = None,
                 direction: str | None = None) -> dict[str, Any]:
        """Say that each row of a table is a person or an organisation, identified by any of
        `field` (one or several), or an interaction with the person those fields name, on
        `date`; rows already there are linked now."""
        current = self._schema(name)
        current["identity"] = _check_identity(
            {"rows_are": rows_are, "fields": field, "organisation": organisation,
             "date": date, "direction": direction},
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

    def _identity(self, name: str) -> dict[str, Any] | None:
        identity: dict[str, Any] | None = self._schema(name).get("identity")
        return identity

    def _link(self, name: str, rid: str, values: dict[str, Any],
              identity: dict[str, Any] | None = None) -> str | None:
        """Link one row to the entity its identity fields name (any of their values: two
        emails, an email and a phone); None when they name none. Two people the row's keys
        already were apart are never merged by it: the pair is noted for the person (P8)."""
        identity = identity or self._identity(name)
        if not identity or self.entities is None:
            return None
        keys: dict[str, list[str]] = {}
        for field in _field_list(identity.get("fields") or identity.get("field")):
            raw = values.get(field)
            for value in raw if isinstance(raw, list) else [raw]:
                key = hard_key(value)
                if key is not None:
                    keys.setdefault(key[0], []).append(key[1])
        if not keys:
            return None
        title_field = self.store.one("SELECT title_field FROM collections WHERE name = ?",
                                     (name,))
        label = values.get(title_field["title_field"]) if title_field else None
        company = values.get(identity["organisation"]) if identity.get("organisation") else None
        interaction = identity["rows_are"] == "interaction"
        if interaction:
            label = None  # the row is a message or a call; its person is named by their key
        resolved = self.entities.resolve(
            "person" if interaction else identity["rows_are"],
            str(label or next(iter(keys.values()))[0]), keys,
            source=f"record:{name}/{rid}",
            organisation=str(company) if isinstance(company, str) and company.strip() else None)
        for a, b in resolved["pairs"]:
            self.entities.note_pair(a, b, "one row names both")
        entity = resolved["entity"]
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

    def record_changes(self, name: str, rid: str, before: int | None = None,
                count: int = 20) -> dict[str, Any]:
        """A record's changes, newest first, for its page's History: for each revision, the
        fields that differ from the revision before it (what they were, what they became),
        when, and the provenance of the new values. Read from `record_versions` by the
        record's own key, never from the journal. `before` asks for the changes older than a
        revision and `count` is how many one page holds; nothing is dropped, `more` says an
        older page is there. `added` is when the record was made and by whom."""
        current = self.store.one(
            'SELECT revision, "values", provenance, created_at FROM records'
            " WHERE collection = ? AND id = ?", (name, rid))
        if current is None:
            raise Problem(f"There is no record {rid} in '{name}'.")
        states = [{"revision": r["revision"], "values": loads(r["values"], {}),
                   "by": loads(r["provenance"], {}), "until": r["replaced_at"]}
                  for r in self.store.all(
                      'SELECT revision, "values", provenance, replaced_at FROM record_versions'
                      " WHERE collection = ? AND record_id = ? ORDER BY revision", (name, rid))]
        if not states or states[-1]["revision"] != current["revision"]:
            states.append({"revision": current["revision"], "values": loads(current["values"], {}),
                           "by": loads(current["provenance"], {}), "until": None})
        found: list[dict[str, Any]] = []
        for old, new in zip(states, states[1:], strict=False):
            names = sorted(set(old["values"]) | set(new["values"]))
            fields = [{"field": f, "before": old["values"].get(f), "after": new["values"].get(f)}
                      for f in names if old["values"].get(f) != new["values"].get(f)]
            if fields:
                found.append({"revision": new["revision"], "at": old["until"], "by": new["by"],
                              "fields": fields})
        found.reverse()
        if before is not None:
            found = [c for c in found if c["revision"] < before]
        return {"changes": found[:count], "more": len(found) > count,
                "added": {"at": current["created_at"], "by": states[0]["by"]}}

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
            **({"world": True} if loads(row["schema"]).get("world") else {}),
            "records": count["n"] if count else 0,
            "created_at": row["created_at"],
        }

    def names(self) -> list[str]:
        return [r["name"] for r in self.store.all("SELECT name FROM collections ORDER BY name")]

    def overview(self, module: str | None = None) -> list[dict[str, Any]]:
        rows = self.store.all(
            "SELECT c.name, c.title, c.module, json_extract(c.schema, '$.world') AS own,"
            " COUNT(r.id) AS n FROM collections c"
            " LEFT JOIN records r ON r.collection = c.name AND r.deleted_at IS NULL"
            + (" WHERE c.module = ?" if module is not None else "")
            + " GROUP BY c.name ORDER BY c.module, c.name",
            (module,) if module is not None else (),
        )
        return [
            {"name": r["name"], "title": r["title"], "module": r["module"], "records": r["n"],
             **({"world": True} if r["own"] else {})}
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
        hook = self.hooks.get(name)
        if hook is not None:
            clean = hook.shape(clean, None, provenance)
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
            if hook is not None:
                hook.changed(db, rid, None, clean)
        self._link(name, rid, clean)
        return self.get(name, rid)

    def upsert(
        self, name: str, key: str, rows: list[dict[str, Any]], provenance: dict[str, Any],
        *, fill_only: set[str] | None = None, seen_by: str | None = None,
        mark_gone: bool = True, sources: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Add or update many records at once, matching on `key` (e.g. a URL). A record whose
        values didn't change is left alone. Fields in `fill_only` are written only where the
        record has no value yet, so the person's own edits (tags, notes) are never overwritten.
        Rows that don't fit the table are set aside, counted as `invalid` with the first few
        reasons in `problems`, and the rest are saved. With `seen_by` (a reader's name), every
        row the reader returned is marked seen now, and the reader's rows it didn't return are
        marked gone (`gone`); a row that comes back is no longer gone. `sources`: each row's
        values' own sources (P5), by the row's place in `rows`. Returns counts and the ids
        touched."""
        base = provenance
        schema = self._schema(name)
        identity = schema.get("identity")
        hook = self.hooks.get(name)
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
        # list at once (a build and an agent) cannot both add a row for one key, and a
        # crash leaves the table as it was (found by the 3 Oct review).
        with self.store.tx() as db:
            existing: dict[str, sqlite3.Row] = {}
            for row in db.execute(
                'SELECT * FROM records WHERE collection = ? AND deleted_at IS NULL', (name,)
            ).fetchall():
                value = loads(row["values"], {}).get(key)
                if value is not None:
                    existing[str(value)] = row
            for i, raw in enumerate(rows):
                own = sources[i] if sources and i < len(sources) else None
                provenance = {**base, "fields": own} if own else base
                match = raw.get(key)
                if match in (None, "") or str(match) in seen:
                    counts["skipped"] += 1
                    continue
                seen.add(str(match))
                prior = existing.get(str(match))
                # One bad row never sinks the batch: it is set aside and reported.
                try:
                    clean = self._validate(name, raw, partial=prior is not None)
                    if hook is not None and prior is None:
                        clean = hook.shape(clean, None, provenance)
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
                    if hook is not None:
                        hook.changed(db, rid, None, clean)
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
                if hook is not None and merged != current:
                    try:
                        merged = hook.shape(merged, current, provenance)
                    except Problem as e:
                        counts["invalid"] += 1
                        if len(problems) < 5:
                            problems.append(f"{match}: {e}")
                        seen_ids.append(prior["id"])
                        continue
                seen_ids.append(prior["id"])
                if merged == current:
                    counts["unchanged"] += 1
                    if identity and not prior["entity_id"]:
                        to_link.append((prior["id"], current))
                    continue
                self._keep(db, name, prior["id"])
                kept = carry_fields(loads(prior["provenance"], {}), provenance,
                                    {k for k in merged if merged.get(k) != current.get(k)})
                db.execute(
                    'UPDATE records SET "values" = ?, revision = revision + 1, provenance = ?,'
                    " updated_at = ? WHERE collection = ? AND id = ?",
                    (dumps(merged), dumps(kept), stamp, name, prior["id"]),
                )
                db.execute(
                    "DELETE FROM records_fts WHERE collection = ? AND record_id = ?",
                    (name, prior["id"]),
                )
                db.execute(
                    "INSERT INTO records_fts (collection, record_id, text) VALUES (?,?,?)",
                    (name, prior["id"], _search_text(merged)),
                )
                if hook is not None:
                    hook.changed(db, prior["id"], current, merged)
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
        before = dict(merged)
        merged.update(clean)
        hook = self.hooks.get(name)
        if hook is not None:
            merged = hook.shape(merged, before, provenance)
        provenance = carry_fields(current.get("_provenance") or {}, provenance,
                                  {k for k in merged if merged.get(k) != before.get(k)})
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
            if hook is not None:
                hook.changed(db, rid, before, merged)
        self._link(name, rid, merged)
        return self.get(name, rid)

    def mark_checked(self, name: str, rid: str, checked: dict[str, Any], *,
                     field: str | None = None) -> dict[str, Any]:
        """Columbo's mark (Q47): what was checked, against what, whether it agreed; on the
        record, or on one field a part filled. A mark is not a change of the record: its
        values, revision and history stay as they are; only the provenance carries it."""
        row = self.store.one(
            "SELECT provenance FROM records WHERE collection = ? AND id = ?"
            " AND deleted_at IS NULL", (name, rid))
        if row is None:
            raise Problem(f"There is no record {rid} in '{name}'.")
        prov: dict[str, Any] = loads(row["provenance"], {})
        if field:
            fields = dict(prov.get("fields") or {})
            entry = dict(fields.get(field) or {})
            entry["checked"] = checked
            fields[field] = entry
            prov["fields"] = fields
        else:
            prov["checked"] = checked
        with self.store.tx() as db:
            db.execute("UPDATE records SET provenance = ? WHERE collection = ? AND id = ?"
                       " AND deleted_at IS NULL", (dumps(prov), name, rid))
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
            for listener in self.on_remove:
                listener(db, name, rid)

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
            # a removed module's rows are out of sight with it (slice 2 A4)
            " AND f.collection NOT IN (SELECT c.name FROM collections c JOIN modules m ON"
            " m.id = c.module WHERE m.removed_at IS NOT NULL)"
            " ORDER BY bm25(records_fts), r.updated_at DESC LIMIT ?",
            (query, max(1, min(limit, 100))),
        )
        return [
            {"collection": r["collection"], "id": r["record_id"], "snippet": r["snip"],
             "updated_at": r["updated_at"]}
            for r in rows
        ]
