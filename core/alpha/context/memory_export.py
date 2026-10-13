"""Everything Alpha remembers, to take away (13 Oct, slice 2 D1b): what it knows about the person,
their goals, standing instructions and permissions, each module's page, the notes Alpha keeps,
and each person's and company's page and facts, every item with its source and date. One
structure (`memory`), written as Markdown for the person to read and as JSON for another
program. Nothing is summarised or left out: it is what the world holds."""

from __future__ import annotations

from typing import Any

from alpha.world.world import World


def _fact(f: dict[str, Any]) -> dict[str, Any]:
    return {"what": f["predicate"].replace("_", " "), "value": f["value"], "state": f["state"],
            "source": f["source"], "since": f["valid_from"], "recorded": f["recorded_at"],
            "why": f.get("why")}


def memory(world: World) -> dict[str, Any]:
    k = world.knowledge
    notes = k.notes()
    by_scope: dict[str, list[dict[str, Any]]] = {}
    for n in notes:
        by_scope.setdefault(n["scope"].split(":", 1)[0], []).append(
            {"scope": n["scope"], "title": n["title"], "body": n["body"],
             "updated": n["updated_at"]})
    people = []
    for kind in ("person", "organisation"):
        for e in world.entities.find(kind=kind, limit=10_000):
            page = k.find_note(f"entity:{e['id']}", e["name"])
            facts = [_fact(f) for f in k.facts(f"entity:{e['id']}")]
            if page or facts:
                people.append({"name": e["name"], "kind": kind, "facts": facts,
                               "page": page["body"] if page else None,
                               "updated": page["updated_at"] if page else None})
    modules = {m["id"]: m["name"] for m in world.modules.all()}
    return {
        "about_you": [_fact(f) for f in k.facts("person")],
        "goals": [{"text": g["text"], "state": g["state"], "since": g["since"],
                   "until": g.get("until"), "module": modules.get(g["module"] or "")}
                  for g in k.goals(None)],
        "instructions": k.instructions(),
        "permissions": [{"what": p["sentence"], "since": p["granted_at"]}
                        for p in world.permissions.live()],
        "module_pages": by_scope.get("module", []),
        "notes": [n for scope, items in by_scope.items()
                  if scope not in ("module", "entity") for n in items],
        "people": people,
    }


def _source(item: dict[str, Any]) -> str:
    said = {"stated": "you said so"}.get(item.get("source") or "", item.get("source") or "")
    if said.startswith("turn:"):
        said = "from a conversation"
    return f"{said}, {str(item.get('recorded') or item.get('since') or '')[:10]}".strip(", ")


def _nested(body: str) -> str:
    """A page's own headings sit under the page's heading (###), so the document's outline holds:
    "## What this is for" in a module's page becomes "#####"."""
    lines = []
    for line in body.strip().splitlines():
        if line.startswith("#"):
            hashes = len(line) - len(line.lstrip("#"))
            line = "#" * min(6, hashes + 3) + line[hashes:]
        lines.append(line)
    return "\n".join(lines)


def to_markdown(mem: dict[str, Any], *, at: str) -> str:
    out = [f"# What Alpha remembers\n\nExported {at}. Every item says"
           " where it came from and when.\n"]
    out.append("## About you\n")
    out += [f"- **{f['what'].capitalize()}**: {f['value']} ({_source(f)})"
            for f in mem["about_you"]]
    out.append("\n## Goals\n")
    out += [f"- {g['text']} ({g['state']}, since {g['since'][:10]}"
            f"{', in ' + g['module'] if g['module'] else ''})" for g in mem["goals"]]
    out.append("\n## Your standing instructions\n")
    out += [f"- {i}" for i in mem["instructions"]] or ["- None."]
    out.append("\n## What Alpha may do without asking\n")
    out += [f"- {p['what']} (since {p['since'][:10]})" for p in mem["permissions"]] or ["- None."]
    out.append("\n## Your modules' pages\n")
    for n in mem["module_pages"]:
        out.append(f"### {n['title']} (updated {n['updated'][:10]})\n\n{_nested(n['body'])}\n")
    out.append("## People and companies\n")
    for e in mem["people"]:
        out.append(f"### {e['name']} ({'company' if e['kind'] == 'organisation' else 'person'})\n")
        out += [f"- **{f['what'].capitalize()}**: {f['value']} ({_source(f)})" for f in e["facts"]]
        if e["page"]:
            out.append(f"\n{_nested(e['page'])}\n")
    out.append("\n## Alpha's other notes\n")
    for n in mem["notes"]:
        out.append(f"### {n['title']} ({n['scope']}, updated {n['updated'][:10]})\n\n"
                   f"{_nested(n['body'])}\n")
    return "\n".join(out).rstrip() + "\n"
