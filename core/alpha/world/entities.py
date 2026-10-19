"""Entities: the people, organisations, places, documents, messages and calendar events that
recur across sources. They are the join keys of the world (the Priya on a site is the Priya who
emailed), so resolution is careful: hard keys (an email address, a profile URL, a phone number,
a file path, a calendar UID) merge with no model call; a name alone never merges, it is returned
as a "maybe" for the person or a later judgement to decide. A merge is undoable.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world import phones
from alpha.world.store import Problem, Store, dumps, loads, new_id, now

KINDS = {"person", "organisation", "place", "document", "message", "event"}
# `orgname`: an organisation's name as a key of its own (Q97: the exact same company name,
# case aside, is one organisation; a person never merges by name)
KEYS = {"email", "phone", "url", "path", "uid", "domain", "orgname"}
# mail services everyone uses: an address there says nothing about where its owner works
GENERIC_DOMAINS = frozenset({
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com",
    "msn.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "ymail.com", "icloud.com", "me.com",
    "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.de",
    "mail.com", "zoho.com", "yandex.com", "qq.com", "163.com", "rediffmail.com", "fastmail.com",
    "hey.com", "duck.com", "btinternet.com", "sky.com", "comcast.net", "verizon.net",
    "att.net", "web.de", "orange.fr", "free.fr", "libero.it", "naver.com", "singnet.com.sg"})
MEMBER = "member_of"


def _norm(key: str, value: str, region: str | None = None) -> str:
    value = value.strip()
    if key in {"email", "domain"}:
        return value.lower()
    if key == "url":
        return value.lower().rstrip("/").removeprefix("https://").removeprefix("http://").removeprefix("www.")
    if key == "phone":
        return phones.key(value, region)
    if key == "orgname":
        return name_key(value)
    return value


def name_key(name: str) -> str:
    """A name as it is compared: case and spacing aside, trailing punctuation dropped."""
    return " ".join(str(name).lower().split()).strip(" .,;")


def domain_of(email: str) -> str | None:
    """The domain an address says its owner belongs to; None for a mail service everyone uses."""
    _, at, domain = str(email).strip().lower().rpartition("@")
    if not at or "." not in domain or domain in GENERIC_DOMAINS:
        return None
    return domain


def _is_key(name: str) -> bool:
    """A name that is only a way to reach someone (an address, a number, a link)."""
    text = str(name).strip()
    return "@" in text or text.lower().startswith(("http://", "https://")) or (
        sum(ch.isdigit() for ch in text) >= 6 and not any(ch.isalpha() for ch in text))


def domain_words(domain: str) -> str:
    """An organisation's name until a source names it: `restopros.com` → "Restopros"."""
    first = domain.split(".")[0]
    return first[:1].upper() + first[1:]


def _view(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "name": row["canonical"],
        "aliases": loads(row["aliases"], []),
        "keys": loads(row["keys"], {}),
        "merged_into": row["merged_into"],
        "source": row["source"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


class Entities:
    def __init__(self, store: Store) -> None:
        self.store = store
        self._region: tuple[int, str | None] | None = None

    def region(self) -> str | None:
        """The country a phone written without its code is read in (Q97): the one most of the
        kept numbers that carry a code are in, else the Mac's region."""
        row = self.store.one("SELECT COUNT(*) AS n FROM entity_keys WHERE key = 'phone'"
                             " AND value LIKE '+%'")
        count = int(row["n"]) if row else 0
        if self._region is None or self._region[0] != count:
            numbers = [r["value"] for r in self.store.all(
                "SELECT value FROM entity_keys WHERE key = 'phone' AND value LIKE '+%'")]
            self._region = (count, phones.likely_region(numbers))
        return self._region[1]

    def get(self, eid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM entities WHERE id = ?", (eid,))
        if row is None:
            raise Problem(f"There is no entity {eid}.")
        if row["merged_into"]:
            return self.get(row["merged_into"])
        return _view(row)

    def _by_keys(self, keys: dict[str, list[str]]) -> str | None:
        for key, values in keys.items():
            for value in values:
                row = self.store.one(
                    "SELECT entity_id FROM entity_keys WHERE key = ? AND value = ?", (key, value)
                )
                if row:
                    return str(self.get(row["entity_id"])["id"])
        return None

    def _clean_keys(self, keys: dict[str, Any] | None,
                    region: str | None = None) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for key, raw in (keys or {}).items():
            if key not in KEYS:
                raise Problem(f"'{key}' is not an identifying key; use one of"
                              f" {sorted(KEYS - {'orgname'})} (a profile or page address is"
                              " 'url').")
            values = raw if isinstance(raw, list) else [raw]
            if key == "phone" and region is None and any(
                    not str(v).strip().startswith(("+", "00")) for v in values):
                region = self.region()
            clean = list(dict.fromkeys(c for v in values if str(v).strip()
                                       if (c := _norm(key, str(v), region))))
            if clean:
                out[key] = clean
        return out

    def find(
        self,
        *,
        name: str | None = None,
        kind: str | None = None,
        keys: dict[str, Any] | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        clean = self._clean_keys(keys)
        if clean:
            hit = self._by_keys(clean)
            return [self.get(hit)] if hit else []
        where = ["merged_into IS NULL"]
        args: list[Any] = []
        if kind:
            where.append("kind = ?")
            args.append(kind)
        if name:
            where.append("(LOWER(canonical) LIKE ? OR LOWER(aliases) LIKE ?)")
            args.extend([f"%{name.lower()}%", f"%{name.lower()}%"])
        rows = self.store.all(
            f"SELECT * FROM entities WHERE {' AND '.join(where)} ORDER BY updated_at DESC LIMIT ?",
            (*args, limit),
        )
        return [_view(r) for r in rows]

    def resolve(
        self, kind: str, name: str, keys: dict[str, Any] | None = None,
        source: str | None = None, *, region: str | None = None,
        organisation: str | None = None,
    ) -> dict[str, Any]:
        """The entity these details identify: an existing one when a hard key matches (its keys
        and aliases grow), else a new one. Same-name entities without a shared key come back as
        `maybe`, never merged. A person is linked to the organisation of each email domain
        that is no mail service, and to `organisation` (a company's name) when given (Q97).
        `pairs`: two entities the keys named apart, never merged by code (the caller proposes
        them, `world/people.py`)."""
        if kind not in KINDS:
            raise Problem(f"'{kind}' is not an entity kind; use one of {sorted(KINDS)}.")
        name = name.strip()
        if not name:
            raise Problem("An entity needs a name.")
        clean = self._clean_keys(keys, region)
        if kind == "organisation" and "orgname" not in clean:
            clean["orgname"] = [name_key(name)]
        stamp = now()
        with self.store.tx() as db:  # the lookup and the write under one lock: no duplicates
            out = self._resolve(db, kind, name, clean, source, stamp)
            if kind == "person":
                out["pairs"] = out["pairs"] + self._organisations(
                    db, out["entity"]["id"], clean, (organisation or "").strip(), source, stamp)
            return out

    def _organisations(self, db: sqlite3.Connection, person: str,
                       clean: dict[str, list[str]], company: str, source: str | None,
                       stamp: str) -> list[tuple[str, str]]:
        """A person's organisations: one per email domain that is no mail service (a hard key),
        and the company a source names (its exact name, Q97). The company goes with the first
        such domain, so `RestoPros` and `restopros.com` are one organisation, named by the
        company. Returns pairs of organisations the keys found apart."""
        domains = list(dict.fromkeys(d for e in clean.get("email", []) if (d := domain_of(e))))
        pairs: list[tuple[str, str]] = []
        for i, domain in enumerate(domains):
            keys: dict[str, list[str]] = {"domain": [domain]}
            name, named = domain_words(domain), f"domain:{domain}"
            if company and i == 0:
                keys["orgname"] = [name_key(company)]
                name, named = company, source or "company"
            org = self._resolve(db, "organisation", name, keys, named, stamp)
            pairs += org["pairs"]
            self._link(db, person, org["entity"]["id"], MEMBER, f"domain:{domain}", source, stamp)
        if company and not domains:
            org = self._resolve(db, "organisation", company, {"orgname": [name_key(company)]},
                                source, stamp)
            pairs += org["pairs"]
            self._link(db, person, org["entity"]["id"], MEMBER, "company", source, stamp)
        return pairs

    def _hits(self, keys: dict[str, list[str]]) -> list[str]:
        """Every entity any of these keys already names, in the keys' order."""
        out: list[str] = []
        for key, values in keys.items():
            for value in values:
                row = self.store.one(
                    "SELECT entity_id FROM entity_keys WHERE key = ? AND value = ?", (key, value))
                if row:
                    eid = str(self.get(row["entity_id"])["id"])
                    if eid not in out:
                        out.append(eid)
        return out

    def _resolve(self, db: sqlite3.Connection, kind: str, name: str,
                 clean: dict[str, list[str]], source: str | None, stamp: str) -> dict[str, Any]:
        hits = self._hits(clean) if clean else []
        if hits:
            hit, others = hits[0], hits[1:]
            current = self.get(hit)
            merged_keys: dict[str, list[str]] = current["keys"]
            # a key another entity already holds stays with it: two people are never merged
            # by a row naming both (the pair is proposed instead)
            taken = {(k, v) for o in others for k, vs in self.get(o)["keys"].items() for v in vs}
            mine = {k: [v for v in vs if (k, v) not in taken] for k, vs in clean.items()}
            mine = {k: vs for k, vs in mine.items() if vs}
            for key, values in mine.items():
                merged_keys[key] = sorted(set(merged_keys.get(key, [])) | set(values))
            aliases = current["aliases"]
            canonical = current["name"]
            named_by_domain = str(current.get("source") or "").startswith("domain:")
            better = (named_by_domain and not (source or "").startswith("domain:")) or (
                _is_key(canonical) and not _is_key(name))
            if better and name != canonical:
                # one named after its domain or a key (an address, a number) takes the name a
                # source gives it; an old name that was a name stays as an alias
                aliases = sorted(set(aliases) | ({canonical} if not _is_key(canonical)
                                                 else set()))
                canonical = name
                if named_by_domain:
                    db.execute("UPDATE entities SET source = ? WHERE id = ?", (source, hit))
            elif name != canonical and name not in aliases and not _is_key(name):
                aliases.append(name)  # an address or a number is a key, never a name
            db.execute(
                "UPDATE entities SET canonical = ?, keys = ?, aliases = ?, updated_at = ?"
                " WHERE id = ?", (canonical, dumps(merged_keys), dumps(aliases), stamp, hit))
            self._index(db, hit, mine)
            return {"entity": self.get(hit), "created": False, "maybe": [],
                    "pairs": [(hit, o) for o in others]}
        maybe = [e for e in self.find(name=name, kind=kind) if e["name"].lower() == name.lower()]
        eid = new_id("e")
        db.execute(
            "INSERT INTO entities (id, kind, canonical, keys, source, created_at,"
            " updated_at) VALUES (?,?,?,?,?,?,?)",
            (eid, kind, name, dumps(clean), source, stamp, stamp),
        )
        self._index(db, eid, clean)
        return {"entity": self.get(eid), "created": True, "maybe": maybe, "pairs": []}

    # ---- one entity belonging to another (P8) ----

    @staticmethod
    def _link(db: sqlite3.Connection, entity: str, other: str, kind: str, by: str,
              source: str | None, stamp: str) -> None:
        """A link, once: the same entity, other, kind and way is not linked twice."""
        if entity == other:
            return
        open_ = db.execute("SELECT 1 FROM entity_links WHERE entity = ? AND other = ? AND kind = ?"
                           " AND by = ? AND ended_at IS NULL", (entity, other, kind, by)).fetchone()
        if open_ is None:
            db.execute("INSERT INTO entity_links (id, entity, other, kind, by, source,"
                       " created_at) VALUES (?,?,?,?,?,?,?)",
                       (new_id("el"), entity, other, kind, by, source, stamp))

    def end_links(self, entity: str, kind: str, *, source: str, keep: set[str]) -> int:
        """A source's links of `entity` that it no longer gives end (a contact's new company):
        kept with their dates in the person's history."""
        with self.store.tx() as db:
            rows = db.execute("SELECT id, other FROM entity_links WHERE entity = ? AND kind = ?"
                              " AND source = ? AND ended_at IS NULL", (entity, kind, source))
            gone = [r["id"] for r in rows.fetchall() if r["other"] not in keep]
            for lid in gone:
                db.execute("UPDATE entity_links SET ended_at = ? WHERE id = ?", (now(), lid))
        return len(gone)

    def links(self, entity: str, kind: str = MEMBER, *,
              ended: bool = False) -> list[dict[str, Any]]:
        """What an entity belongs to (its organisations), through merges: each with how it was
        linked; with `ended`, the links that ended too."""
        ids = self.parts(entity)
        marks = ",".join("?" * len(ids))
        rows = self.store.all(
            f"SELECT * FROM entity_links WHERE entity IN ({marks}) AND kind = ?"
            + ("" if ended else " AND ended_at IS NULL") + " ORDER BY created_at",
            (*ids, kind))
        out: dict[str, dict[str, Any]] = {}
        for r in rows:
            other = self.get(r["other"])
            seen = out.setdefault(other["id"], {**other, "by": [], "ended_at": r["ended_at"]})
            if r["by"] not in seen["by"]:
                seen["by"].append(r["by"])
            if r["ended_at"] is None:
                seen["ended_at"] = None
        return list(out.values())

    def members(self, org: str, kind: str = MEMBER) -> list[dict[str, Any]]:
        """Who belongs to an organisation now (through merges, both ways)."""
        ids = self.parts(org)
        marks = ",".join("?" * len(ids))
        found: dict[str, dict[str, Any]] = {}
        for r in self.store.all(f"SELECT entity FROM entity_links WHERE other IN ({marks})"
                                " AND kind = ? AND ended_at IS NULL", (*ids, kind)):
            person = self.get(r["entity"])
            found[person["id"]] = person
        return list(found.values())

    def parts(self, eid: str) -> list[str]:
        """An entity and every entity merged into it, at any depth."""
        out, todo = [], [self.get(eid)["id"]]
        while todo:
            current = todo.pop()
            if current in out:
                continue
            out.append(current)
            todo.extend(r["id"] for r in self.store.all(
                "SELECT id FROM entities WHERE merged_into = ?", (current,)))
        return out

    def note_pair(self, a: str, b: str, why: str) -> bool:
        """Two entities that may be the same, noted for the person to decide (P8): never merged
        here, and never noted again once decided either way."""
        a, b = sorted((self.get(a)["id"], self.get(b)["id"]))
        if a == b:
            return False
        with self.store.tx() as db:
            cur = db.execute("INSERT OR IGNORE INTO maybe_same (id, a, b, why, state, created_at)"
                             " VALUES (?,?,?,?, 'found', ?)", (new_id("ms"), a, b, why, now()))
        return cur.rowcount > 0

    def merged_into_it(self, eid: str) -> list[dict[str, Any]]:
        """The entities merged straight into this one, each as it was on its own (Unmerge)."""
        return [_view(r) for r in self.store.all(
            "SELECT * FROM entities WHERE merged_into = ? ORDER BY updated_at", (eid,))]

    def index_orgnames(self) -> int:
        """Organisations kept before 19 Oct get their name as a key (Q97: the exact same
        company name is one organisation); one named only after its domain doesn't, and a name
        two organisations already share stays unkeyed on the second (a merge is the person's)."""
        added = 0
        with self.store.tx() as db:
            for r in db.execute(
                    "SELECT id, canonical, keys FROM entities WHERE kind = 'organisation' AND"
                    " merged_into IS NULL AND (source IS NULL OR source NOT LIKE 'domain:%')"
                    " AND id NOT IN (SELECT entity_id FROM entity_keys WHERE key = 'orgname')"
                    ).fetchall():
                value = name_key(r["canonical"])
                if not value or db.execute("SELECT 1 FROM entity_keys WHERE key = 'orgname' AND"
                                           " value = ?", (value,)).fetchone():
                    continue
                keys = loads(r["keys"], {})
                keys["orgname"] = [value]
                db.execute("UPDATE entities SET keys = ? WHERE id = ?", (dumps(keys), r["id"]))
                db.execute("INSERT INTO entity_keys (key, value, entity_id) VALUES"
                           " ('orgname', ?, ?)", (value, r["id"]))
                added += 1
        return added

    def renormalise_phones(self) -> int:
        """Phones kept before 19 Oct as digits, read again into E.164 (P8): the same number
        written two ways becomes one key. One that two entities would then share stays as it
        was (a merge is the person's)."""
        region = self.region()
        changed = 0
        with self.store.tx() as db:
            for r in db.execute("SELECT value, entity_id FROM entity_keys WHERE key = 'phone'"
                                " AND value NOT LIKE '+%'").fetchall():
                better = phones.e164(r["value"], region)
                if not better or better == r["value"]:
                    continue
                held = db.execute("SELECT entity_id FROM entity_keys WHERE key = 'phone' AND"
                                  " value = ?", (better,)).fetchone()
                if held and held["entity_id"] != r["entity_id"]:
                    continue
                db.execute("DELETE FROM entity_keys WHERE key = 'phone' AND value = ?",
                           (r["value"],))
                db.execute("INSERT OR IGNORE INTO entity_keys (key, value, entity_id)"
                           " VALUES ('phone', ?, ?)", (better, r["entity_id"]))
                row = db.execute("SELECT keys FROM entities WHERE id = ?",
                                 (r["entity_id"],)).fetchone()
                keys = loads(row["keys"], {}) if row else {}
                keys["phone"] = sorted({better if v == r["value"] else v
                                        for v in keys.get("phone", [])})
                db.execute("UPDATE entities SET keys = ? WHERE id = ?",
                           (dumps(keys), r["entity_id"]))
                changed += 1
        return changed

    @staticmethod
    def _index(db: sqlite3.Connection, eid: str, keys: dict[str, list[str]]) -> None:
        for key, values in keys.items():
            for value in values:
                db.execute(
                    "INSERT OR IGNORE INTO entity_keys (key, value, entity_id) VALUES (?,?,?)",
                    (key, value, eid),
                )

    def merge(self, keep: str, into_it: str) -> dict[str, Any]:
        """`into_it` becomes part of `keep`. Its keys point at `keep`; its row stays so the merge
        can be undone."""
        a, b = self.get(keep), self.get(into_it)
        if a["id"] == b["id"]:
            raise Problem("Those are already the same entity.")
        keys: dict[str, list[str]] = a["keys"]
        for key, values in b["keys"].items():
            keys[key] = sorted(set(keys.get(key, [])) | set(values))
        aliases = sorted(set(a["aliases"]) | set(b["aliases"]) | {b["name"]} - {a["name"]})
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "UPDATE entities SET keys = ?, aliases = ?, updated_at = ? WHERE id = ?",
                (dumps(keys), dumps(aliases), stamp, a["id"]),
            )
            db.execute(
                "UPDATE entities SET merged_into = ?, updated_at = ? WHERE id = ?",
                (a["id"], stamp, b["id"]),
            )
            db.execute(
                "UPDATE entity_keys SET entity_id = ? WHERE entity_id = ?", (a["id"], b["id"])
            )
            # the files kept about the one merged in go to the one kept (slice 2 B11)
            db.execute("UPDATE documents SET about = ? WHERE about = ?", (a["id"], b["id"]))
        return self.get(a["id"])

    def unmerge(self, eid: str) -> dict[str, Any]:
        """Undo a merge: the entity stands alone again with the keys it had."""
        row = self.store.one("SELECT * FROM entities WHERE id = ?", (eid,))
        if row is None or not row["merged_into"]:
            raise Problem(f"{eid} is not merged into anything.")
        own = loads(row["keys"], {})
        parent = str(row["merged_into"])
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "UPDATE entities SET merged_into = NULL, updated_at = ? WHERE id = ?", (stamp, eid)
            )
            for key, values in own.items():
                for value in values:
                    db.execute(
                        "UPDATE entity_keys SET entity_id = ? WHERE key = ? AND value = ?",
                        (eid, key, value),
                    )
            # the one it was merged into keeps only what is its own again (P8): its keys as the
            # index has them, its aliases without the name that came with the merge
            kept: dict[str, list[str]] = {}
            for r in db.execute("SELECT key, value FROM entity_keys WHERE entity_id = ?",
                                (parent,)).fetchall():
                kept.setdefault(r["key"], []).append(r["value"])
            prow = db.execute("SELECT aliases FROM entities WHERE id = ?", (parent,)).fetchone()
            aliases = [a for a in loads(prow["aliases"], []) if a != row["canonical"]] if prow \
                else []
            db.execute("UPDATE entities SET keys = ?, aliases = ?, updated_at = ? WHERE id = ?",
                       (dumps({k: sorted(v) for k, v in kept.items()}), dumps(aliases), stamp,
                        parent))
        return self.get(eid)
