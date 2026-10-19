"""Every value with its source (P5 of provenance-documents-triggers-proposal.md, Q96; 19 Oct
2026): what one value rests on, in the shape kept on its record (`provenance.fields[field]`),
checked by code before it is kept and never read out of words.

A source is the person's word ("stated"), an estimate (with what was assumed), a web address
(with when it was written), a worked-out formula (with its inputs as they were), a kept document
at a page or a sheet's cell, or a few words naming where it was read. A document source is
checked against the document Alpha keeps: the document is there, its page exists, its sheet and
cell are inside the sheet; a source that fails is refused in plain words, so a number is never
pinned to a place it didn't come from. A value from a cell or a page is then compared with what
the kept file holds there, read again by code, and the mark says whether they agree.
"""

from __future__ import annotations

import json
import re
from typing import Any

from alpha.connectors.files import Files, parse_range
from alpha.world.store import Problem, now
from alpha.world.world import World

SHAPES = ('"stated", "estimated" (with assumed), {"url": address}, {"document": id, "page": n},'
          ' {"document": id, "sheet": name, "cell": "B12"}, or {"formula": words, "inputs":'
          ' {name: value}}')
ESTIMATES = ("estimated", "estimate", "guess", "guessed")
# a record's own keys beside its values (`collections.record_view`, and the table's name)
RECORD_KEYS = {"id", "revision", "created_at", "updated_at", "collection"}


def _words(text: str) -> str:
    return " ".join(text.split())


def where_words(title: str, *, page: int | None = None, sheet: str | None = None,
                cell: str | None = None) -> str:
    """ "P&L.xlsx · P&L!B12", "Bank statement Sept 2025.pdf · page 3": a position as the
    person and the model read it, the same on the record, in "Around it" and in a run."""
    if cell:
        return f"{title} · {sheet}!{cell}" if sheet else f"{title} · {cell}"
    if page:
        return f"{title} · page {page}"
    return title


def of_cell(doc: dict[str, Any], sheet: str, cell: str, formula: str | None = None
            ) -> dict[str, Any]:
    """A value an import took from a cell by code (P6): the cell is its source."""
    return {"kind": "document", "document": doc["id"], "title": doc["title"], "sheet": sheet,
            "cell": cell, **({"formula": formula} if formula else {}),
            "source": where_words(doc["title"], sheet=sheet, cell=cell), "fetched_at": now()}


def _document(world: World, raw: dict[str, Any]) -> dict[str, Any]:
    ref = str(raw.get("document") or "").strip()
    row = world.store.one(
        "SELECT id, title, kind, structure FROM documents WHERE (id = ? OR title = ?)"
        " AND removed_at IS NULL ORDER BY indexed_at LIMIT 1", (ref, ref))
    if row is None:
        raise Problem(f"Alpha keeps no document {ref!r}; give a kept document's id"
                      " (document_find) as the source.")
    title = str(row["title"])
    structure: dict[str, Any] = json.loads(row["structure"]) if row["structure"] else {}
    out: dict[str, Any] = {"kind": "document", "document": row["id"], "title": title}
    page, sheet, cell = raw.get("page"), raw.get("sheet"), raw.get("cell")
    if structure.get("kind") == "pdf":
        pages = int(structure.get("pages") or 0)
        if page is None and pages > 1:
            raise Problem(f"{title} has {pages} pages; say which page the value is on.")
        number = int(page) if page is not None else 1
        if not 1 <= number <= max(pages, 1):
            raise Problem(f"{title} has pages 1 to {pages}; there is no page {page}.")
        out["page"] = number
    elif structure.get("kind") == "sheets":
        sheets = structure.get("sheets") or []
        names = [str(s["name"]) for s in sheets]
        if sheet is None and len(sheets) == 1:
            sheet = names[0]
        chosen = next((s for s in sheets if s["name"] == sheet), None)
        if chosen is None:
            raise Problem(f"{title} has no sheet {sheet!r}; its sheets are {', '.join(names)}."
                          if sheet is not None else
                          f"{title} has sheets {', '.join(names)}; say which one the value is"
                          " on, and its cell.")
        box = parse_range(str(cell)) if cell else None
        if box is None:
            raise Problem(f"Say which cell of {title} · {chosen['name']} the value is in, like"
                          " B12." if not cell else f"{cell!r} isn't a cell like B12.")
        top, left, bottom, right = box
        if bottom > int(chosen["rows"]) or right > int(chosen["columns"]):
            raise Problem(f"{cell} is outside {title} · {chosen['name']}, which has"
                          f" {chosen['rows']} rows and {chosen['columns']} columns.")
        out.update(sheet=chosen["name"], cell=str(cell).replace(" ", "").upper())
        if raw.get("formula"):
            out["formula"] = str(raw["formula"])
    elif page is not None or cell is not None:
        raise Problem(f"{title} has no pages or cells to point at; name the document alone.")
    out["source"] = where_words(title, page=out.get("page"), sheet=out.get("sheet"),
                                cell=out.get("cell"))
    return out


def normalise(world: World, raw: Any) -> dict[str, Any]:
    """One value's source as it is kept. Raises Problem, in plain words, for a source that
    doesn't hold."""
    entry: dict[str, Any]
    if isinstance(raw, str):
        text = _words(raw)
        if not text:
            raise Problem(f"A value's source is empty; give one of {SHAPES}.")
        if text.lower() == "stated":
            entry = {"kind": "stated", "source": "stated"}
        elif text.lower() in ESTIMATES:
            entry = {"kind": "estimated", "source": "estimated"}
        elif re.match(r"https?://", text):
            entry = {"kind": "url", "url": text, "source": text}
        else:
            entry = {"kind": "words", "source": text}
    elif isinstance(raw, dict):
        if raw.get("document"):
            entry = _document(world, raw)
        elif raw.get("url"):
            url = _words(str(raw["url"]))
            if not re.match(r"https?://", url):
                raise Problem(f"{url!r} isn't a web address (http:// or https://).")
            entry = {"kind": "url", "url": url, "source": url}
        elif raw.get("formula"):
            inputs = raw.get("inputs")
            if not isinstance(inputs, dict) or not inputs:
                raise Problem("A worked-out value keeps its inputs as they were: give"
                              " {\"formula\": ..., \"inputs\": {name: value}}.")
            formula = _words(str(raw["formula"]))
            entry = {"kind": "formula", "formula": formula, "inputs": inputs,
                     "source": "worked out: " + formula + " with " + ", ".join(
                         f"{k} = {v}" for k, v in inputs.items())}
        elif raw.get("kind") in ("stated", "estimated") or raw.get("estimated") \
                or raw.get("stated"):
            estimated = raw.get("kind") == "estimated" or bool(raw.get("estimated"))
            entry = {"kind": "estimated" if estimated else "stated",
                     "source": "estimated" if estimated else "stated"}
        else:
            raise Problem(f"A value's source is one of {SHAPES}; got {json.dumps(raw)[:120]}.")
        if raw.get("assumed"):
            entry["assumed"] = _words(str(raw["assumed"]))
    else:
        raise Problem(f"A value's source is one of {SHAPES}.")
    entry["fetched_at"] = now()
    return entry


def _plain(value: Any) -> str:
    """A value as its digits or words, for comparing a value with where it sat: commas,
    spaces, currency signs and a trailing .0 don't count."""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).lower()
    text = re.sub(r"[\s,£$€]", "", text)
    return re.sub(r"(\.\d*?)0+$", r"\1", text).rstrip(".")


def _number(value: Any) -> float | None:
    try:
        return float(_plain(value))
    except ValueError:
        return None


def check_value(world: World, entry: dict[str, Any], value: Any) -> dict[str, Any] | None:
    """A value compared with what its document holds at its cell or page, read again from the
    kept file by code (not the model's memory): the mark kept on the field, or None when code
    can't judge. Numbers are compared as numbers (a cell's, or one on the page); words and
    dates agree when they read the same, and otherwise get no mark, since "December 31, 2018"
    on a page and 2018-12-31 in a row are the same date that code can't tell apart (found 19
    Oct on Kenil's balance sheet: a correct date marked ≠). A cell with nothing in it, or a
    number not on its page, differs."""
    if entry.get("kind") != "document" or value in (None, ""):
        return None
    files = Files(world)
    doc = files.document(str(entry["document"]))
    held: str | None = None
    wanted = _number(value)
    if entry.get("cell") and ":" not in str(entry["cell"]):
        cells = files.cells(doc, entry.get("sheet"), str(entry["cell"]))["cells"]
        held = cells[0]["value"] if cells else ""
        there = _number(held) if held else None
        if not held:
            agree = False
        elif wanted is not None and there is not None:
            agree = abs(there - wanted) < 1e-9 * max(1.0, abs(there))
        elif _plain(held) == _plain(value):
            agree = True
        else:
            return None
    elif entry.get("page"):
        text = files.read(doc["id"], page=int(entry["page"]))["text"]
        if _plain(value) in _plain(text):
            agree = True
        elif wanted is not None:
            agree = False
        else:
            return None
    else:
        return None
    mark: dict[str, Any] = {"at": now(), "by": "code", "agree": agree,
                            "source": entry["source"]}
    if held is not None:
        mark["value"] = held
    return mark


def sourced(world: World, values: dict[str, Any], sources: dict[str, Any] | None,
            fields: set[str], table: str) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """The kept sources of one row's values (`sources`: {field: source}) and the words for
    each value that differs from where it sat. A source naming a field the table hasn't is
    refused; one for a field this row doesn't fill is left out."""
    out: dict[str, dict[str, Any]] = {}
    differs: list[str] = []
    for field, raw in (sources or {}).items():
        if field not in fields:
            raise Problem(f"{table} has no field {field!r} to give a source for.")
        if field not in values:
            continue
        entry = normalise(world, raw)
        mark = check_value(world, entry, values[field])
        if mark is not None:
            entry["checked"] = mark
            if not mark["agree"]:
                differs.append(f"{field} = {values[field]!r}, but {entry['source']} holds"
                               f" {mark.get('value', 'something else')!r}" if "value" in mark
                               else f"{field} = {values[field]!r} isn't on {entry['source']}")
        out[field] = entry
    return out, differs


def checked_by_code(prov: dict[str, Any], values: dict[str, Any]) -> bool:
    """Whether every value of a row rests on a document position its code check agreed with:
    nothing in it for Columbo's model to check again."""
    fields = prov.get("fields") or {}
    filled = [k for k, v in values.items() if not k.startswith("_") and v not in (None, "")
              and k not in RECORD_KEYS]
    return bool(filled) and all(
        (fields.get(k) or {}).get("kind") == "document"
        and ((fields.get(k) or {}).get("checked") or {}).get("agree") for k in filled)
