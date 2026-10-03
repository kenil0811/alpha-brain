"""Tools for tables and their records: making them (in a build), adding, changing, querying, saved
lists, the one-row log."""

from __future__ import annotations

from typing import Any

from alpha.connectors.browser import Browser
from alpha.mcp.tools.base import Base, counts_and_ids, provenance_words, tool
from alpha.world.store import Problem


class Tables(Base):
    @tool
    def collections_list(self) -> list[dict[str, Any]]:
        """Every table Alpha keeps, with its module and how many records it holds."""
        return self.world.collections.overview()

    @tool
    def collection_describe(self, name: str) -> dict[str, Any]:
        """A table's fields (name, kind, choices, unit), its title field and record count. Read
        this before adding or querying records."""
        return self.world.collections.describe(name)

    @tool
    def collection_create(
        self,
        name: str,
        title: str,
        fields: list[dict[str, Any]],
        module: str | None = None,
        title_field: str | None = None,
        rows_are: str | None = None,
        identity_field: str | None = None,
    ) -> dict[str, Any]:
        """Create a table for a kind of thing the person keeps. name: snake_case, e.g.
        food_log. fields: [{"name", "kind", "label"?, "unit"?, "required"?, "choices"?,
        "relation"?}], kind one of text, long_text, number, date, datetime, bool, choice,
        multichoice, status, url, relation. id, created_at and updated_at exist on every record
        already. Design it the way a thoughtful product person would: the fields the person
        will want to see and filter by, units on numbers, a date field when things happen on a
        day. module: the module's id or name it belongs to (create the module first).
        rows_are: "person" or "organisation" when each row is one (a contact, a company), with
        identity_field the field holding what identifies it for sure (an email address or a
        profile URL): every row is then linked to that person or organisation across Alpha."""
        refused = self._gate("Making a table")
        if refused:
            return refused
        module_id = self.world.modules.get(module)["id"] if module else None
        identity = ({"rows_are": rows_are, "field": identity_field or ""}
                    if rows_are else None)
        described = self.world.collections.create(
            name, title, fields, module=module_id, title_field=title_field, identity=identity
        )
        self._did(
            "made",
            f"Made the table {title} ({name}) with fields "
            + ", ".join(f["name"] for f in described["fields"]) + ".",
            {"collection": name},
            module_id,
        )
        return described

    @tool
    def collection_identify(self, name: str, rows_are: str, identity_field: str) -> dict[str, Any]:
        """Say that each row of an existing table is a person or an organisation, identified by
        identity_field (an email address or a profile URL). Rows are linked to the people and
        organisations Alpha knows, now and on every write."""
        described = self.world.collections.identify(name, rows_are, identity_field)
        self._did("changed", f"Linked {described['title']} to {rows_are}s by {identity_field}"
                  f" ({described['linked']} rows).", {"collection": name}, described["module"])
        return described

    @tool
    def record_history(self, collection: str, id: str) -> list[dict[str, Any]]:
        """What a record was before each change, newest first: the values, who changed them
        and until when. Use it for questions about how something used to be."""
        return self.world.collections.history(collection, id)

    @tool
    def collection_add_fields(self, name: str, fields: list[dict[str, Any]]) -> dict[str, Any]:
        """Add fields to an existing table (they are optional for records already saved)."""
        described = self.world.collections.add_fields(name, fields)
        self._did(
            "changed",
            f"Added {', '.join(str(f.get('name')) for f in fields)} to {described['title']}.",
            {"collection": name},
            described["module"],
        )
        return described

    @tool
    def records_add(
        self, collection: str, values: dict[str, Any], source: str,
        assumed: str | None = None,
    ) -> dict[str, Any]:
        """Add one record to a table. values: field name → value. source (required): where the
        values come from: "stated" when the person gave every value; the page or
        document they were read from (a URL, or "label on ocado.com") when looked up; "estimated"
        only for what could not be looked up. assumed: anything you had to assume because it was
        unknown and could not be found ("the 330 ml bottle"), so the record and the person both
        know."""
        prov = self._provenance(source, assumed)
        rec = self.world.collections.add(collection, values, prov)
        desc = self.world.collections.describe(collection)
        label = rec.get(desc["title_field"]) or rec["id"]
        self._did(
            "did",
            f"Added {label} to {desc['title']}{provenance_words(prov)}.",
            {"collection": collection, "record": rec["id"], "values": values},
            desc["module"],
        )
        return rec

    @tool
    def records_upsert(
        self, collection: str, key_field: str, rows: list[dict[str, Any]],
        keep_person_fields: list[str] | None = None,
    ) -> dict[str, Any]:
        """Add or update many records in one call, matching on key_field (e.g. url or email):
        new ones are added, changed ones updated, unchanged ones left alone. Use it for
        anything synced from a source. keep_person_fields: fields only written where the record
        has none yet (tags, notes, priority the person sets), so syncs never overwrite them."""
        result = self.world.collections.upsert(
            collection, key_field, rows, {"by": "alpha", "turn": self.turn, "synced": True},
            fill_only=set(keep_person_fields or []),
        )
        desc = self.world.collections.describe(collection)
        self._did(
            "did",
            f"Synced {desc['title']}: {result['added']} new, {result['updated']} updated,"
            f" {result['unchanged']} unchanged.",
            {"collection": collection, **counts_and_ids(result)},
            desc["module"],
        )
        return {k: v for k, v in result.items() if k != "ids"}

    @tool
    def page_to_table(
        self,
        url: str,
        link_contains: str,
        collection: str,
        fields: dict[str, str],
        to_end: bool = True,
        keep_person_fields: list[str] | None = None,
    ) -> dict[str, Any]:
        """A rough first look at a list page, not a way to keep a list: for anything you will sync,
        write a reader (page_script, then reader_save) and use reader_run. Reads a list page
        (through the person's sign-in where they connected the site), takes
        one item per distinct link whose address contains link_contains (the part of the
        address every item of the list shares, e.g. "/listing/"), and save every item into a
        table in one go, matched on its link so repeat runs update rather than duplicate. fields
        maps table fields to what to take from each item: "url", "text" (the link's words, e.g.
        a name), "near" (the whole card's text) or "near_without_text" (the card minus the link's
        words, e.g. a headline). The url-mapped field is the key. Use it for any list that
        should be kept whole and current; then refine individual rows if needed."""
        if self._in_automation():
            raise Problem(
                "page_to_table is only a first look; it isn't how a list is kept. Write a reader "
                "for this page (page_script to look at the page and try, reader_save), use "
                "reader_run here, and change this automation's procedure to reader_run with "
                "automation_update so every run uses it."
            )
        sources = {"url", "text", "near", "near_without_text"}
        bad = [v for v in fields.values() if v not in sources]
        if bad:
            raise Problem(f"fields must map to one of {sorted(sources)}; got {bad}.")
        key = next((f for f, src in fields.items() if src == "url"), None)
        if key is None:
            raise Problem("Map one table field to \"url\"; it is how items are matched.")
        page = Browser(self.world).items(url, link_contains=link_contains, to_end=to_end,
                                         turn=self.turn, module=self.module)
        if page["needs_signin"]:
            return {"needs_signin": True, "items": 0,
                    "note": "The site asked for a sign-in; offer browser_signin."}
        rows = [{f: item[src] for f, src in fields.items() if item.get(src)}
                for item in page["items"]]
        result = self.world.collections.upsert(
            collection, key, rows,
            {"by": "alpha", "turn": self.turn, "source": url, "synced": True},
            fill_only=set(keep_person_fields or []),
        )
        desc = self.world.collections.describe(collection)
        self._did(
            "did",
            f"Read {len(page['items'])} from {page['title'] or url} into {desc['title']}:"
            f" {result['added']} new, {result['updated']} updated, {result['unchanged']}"
            " unchanged.",
            {"collection": collection, "url": url, "items": len(page["items"]),
             **counts_and_ids(result)},
            desc["module"],
        )
        held = desc["records"]
        warning = (f"Only {len(page['items'])} items came back where the table holds {held}: "
                   "the page probably wasn't read to its end or this isn't the whole list."
                   if held and len(page["items"]) < held * 0.5 else None)
        return {"items": len(page["items"]), "signed_in": page["signed_in"],
                **{k: v for k, v in result.items() if k != "ids"},
                "sample": rows[:3], **({"warning": warning} if warning else {})}

    @tool
    def records_update(
        self, collection: str, id: str, values: dict[str, Any], revision: int,
        source: str | None = None, assumed: str | None = None,
    ) -> dict[str, Any]:
        """Change fields of one record. revision: the record's current revision (from a query);
        if someone changed it meanwhile you get an error and should read it again. source: as
        in records_add, when the new values were looked up ("label on ocado.com"), stated or
        estimated; left out, the record keeps what it had. assumed: as in records_add."""
        before = self.world.collections.get(collection, id)
        prior = before.get("_provenance") or {}
        if source is None:
            prov: dict[str, Any] = {"by": "alpha", "turn": self.turn,
                                    **{k: prior[k] for k in ("source", "estimated", "assumed")
                                       if k in prior}}
            if assumed:
                prov["assumed"] = assumed
        else:
            prov = self._provenance(source, assumed)
        rec = self.world.collections.update(collection, id, values, revision, prov)
        desc = self.world.collections.describe(collection)
        self._did(
            "changed",
            f"Changed {rec.get(desc['title_field']) or id} in {desc['title']}: "
            + ", ".join(f"{k} {before.get(k)!r} → {v!r}" for k, v in values.items())
            + f"{provenance_words(prov) if source else ''}.",
            {"collection": collection, "record": id,
             "before": {k: before.get(k) for k in values}, "after": values},
            desc["module"],
        )
        return rec

    @tool
    def records_delete(self, collection: str, id: str, revision: int) -> dict[str, Any]:
        """Remove one record the person asked to remove."""
        before = self.world.collections.get(collection, id)
        self.world.collections.delete(collection, id, revision)
        desc = self.world.collections.describe(collection)
        self._did(
            "changed",
            f"Removed {before.get(desc['title_field']) or id} from {desc['title']}.",
            {"collection": collection, "record": id, "was": before},
            desc["module"],
        )
        return {"removed": id}

    @tool
    def records_query(
        self,
        collection: str,
        where: dict[str, Any] | None = None,
        order: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Read records. where: {field: value} for equality or {field: {op: value}} with op in
        eq, ne, gt, gte, lt, lte, contains, in, is_null; created_at and updated_at can be
        filtered too. order: a field name, '-' in front for descending (default newest
        first)."""
        return self.world.collections.query(collection, where, order, limit)

    @tool
    def records_aggregate(
        self,
        collection: str,
        op: str,
        field: str | None = None,
        where: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """count, sum, avg, min or max over a table (field must be a number unless op is count),
        with the same where filters as records_query. Use it for totals such as today's
        calories instead of adding numbers up yourself."""
        return self.world.collections.aggregate(collection, op, field, where)

    @tool
    def list_save(self, table: str, title: str, filters: dict[str, str] | None = None,
                  search: str | None = None, hide_done: bool = False,
                  columns: list[str] | None = None, sort_by: str | None = None,
                  descending: bool = False, default: bool = False) -> dict[str, Any]:
        """Keep a saved list on a table: a named way of looking at it the person asked for
        ("keep a list of the Missouri deals under 500k", "show me only open ones by default").
        filters: {field: the one value it must have}; search: words to match; columns: the
        fields to show (others hidden); sort_by with descending; default: the table opens on
        this list. The person sees it in the table's Lists menu and can change or remove it."""
        desc = self.world.collections.describe(table)
        fields = [f["name"] for f in desc["fields"]]
        config: dict[str, Any] = {"search": search or "", "filters": filters or {},
                                  "hide_done": hide_done, "hidden": [], "sort": None,
                                  "view": "table"}
        if columns:
            missing = [c for c in columns if c not in fields]
            if missing:
                raise Problem(f"'{table}' has no field {missing[0]}.")
            config["hidden"] = [f for f in fields if f not in columns]
        if sort_by:
            config["sort"] = {"field": sort_by, "direction": "desc" if descending else "asc"}
        saved = self.world.views.save(table, title, config, default=default,
                                      source=f"turn:{self.turn}" if self.turn else None)
        self._did("made", f"Kept the list \"{saved['title']}\" on {desc['title']}"
                  f"{' as its default' if default else ''}.", {"list": saved["id"],
                                                               "table": table})
        return saved

    @tool
    def table_start(self, title: str, fields: list[dict[str, Any]], values: dict[str, Any],
                    module: str | None = None, name: str | None = None,
                    source: str = "stated", assumed: str | None = None) -> dict[str, Any]:
        """Only for a plain log with nowhere to keep it ("log two boiled eggs" and no food
        table exists): make the simplest table for it (in module, made if it doesn't exist)
        and add this first row. One per message. Anything more is a plan (plan_propose).
        source and assumed: as in records_add."""
        said = self.world.journal.read(self.turn) if self.turn else None
        if not said or said["kind"] != "said" or said["actor"] != "person":
            return {"error": "table_start is for logging what the person just said."}
        if self.world.store.one(
            "SELECT 1 FROM journal WHERE kind = 'made' AND json_extract(data, '$.turn') = ?"
            " AND json_extract(data, '$.table_start') = 1", (self.turn,)):
            return {"error": "One new table per message; propose a plan for more."}
        module_id = None
        if module:
            try:
                module_id = self.world.modules.get(module)["id"]
            except Problem:
                module_id = self.world.modules.create(module)["id"]
                self._did("made", f"Made the module {module}.", {"module": module_id},
                          module_id)
        slug = name or "_".join("".join(ch if ch.isalnum() else " " for ch in title.lower())
                                .split())[:40] or "log"
        described = self.world.collections.create(slug, title, fields, module=module_id)
        self._did("made", f"Made the table {title} to keep this.",
                  {"collection": slug, "table_start": True}, module_id)
        prov = self._provenance(source, assumed)
        row = self.world.collections.add(slug, values, prov)
        self._did("did", f"Added {row.get(described['title_field']) or row['id']} to {title}"
                  f"{provenance_words(prov)}.",
                  {"collection": slug, "record": row["id"], "values": values}, module_id)
        return {"table": described, "row": row}
