"""A second opinion: Alpha's answer checked against an independent one.

Alpha is trusted the way a good assistant is trusted: it says what it knows, what it assumed and
what it could not find. The check keeps it honest. The person's sentence is answered again by
the same model with web search and nothing of Alpha's (no world, no tools), a judging run
compares the two, and the verdict is journaled as `checked`. When they disagree on something the
independent answer can source, Alpha gets the finding as a turn of its own: it corrects the
records, tells the person in a line where the right number comes from, or says why it stands by
its own. It runs after a turn that wrote values Alpha worked out itself, and on the trial of
every finished build; `alpha check <turn>` runs it by hand.
"""

from __future__ import annotations

import json
import re
from typing import Any

from alpha.runtime import route, turn
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World

INDEPENDENT_RULES = """You are a careful assistant with web search, answering on your own. A \
person said the sentence below to their assistant. Give the answer that assistant should have \
given: look up everything that can be looked up (a product's label, a listing, a price, a date, \
a fact) and give exact values with the page you took them from; estimate only what cannot be \
looked up and say so; say plainly what you would have to assume or ask (a size, a quantity, \
which of several things they meant). You have no access to the person's own records, so say \
nothing about those. Under 150 words, plain text."""

JUDGE_RULES = """You compare two answers to the same sentence: Alpha's (an assistant with the \
person's records and web access) and an independent one (web search only). Reply with JSON only:
{"agree": true|false, "differences": ["…"], "unstated": ["…"]}
differences: values or facts in Alpha's answer that the independent answer contradicts with a \
source it names, each as "<what>: Alpha <value>, independent <value> (<source>)". Facts only \
Alpha's records could know (totals of the person's own entries, what they logged) are never \
differences, nor is wording or rounding of the same value.
unstated: things the independent answer would ask or assume (a size, which item was meant) \
that Alpha neither asked nor said it assumed.
agree is false when differences is non-empty. Empty lists when there is nothing."""


def _reply_of(world: World, turn_id: str) -> dict[str, Any] | None:
    row = world.store.one(
        "SELECT id, text FROM journal WHERE kind = 'replied' AND deleted_at IS NULL"
        " AND json_extract(data, '$.turn') = ? ORDER BY at DESC LIMIT 1", (turn_id,))
    return {"id": row["id"], "text": row["text"]} if row else None


def records_of(world: World, turn_id: str) -> list[dict[str, Any]]:
    """The records a turn added or changed, with their provenance."""
    rows = world.store.all(
        "SELECT json_extract(data, '$.collection') AS c, json_extract(data, '$.record') AS r,"
        " json_extract(data, '$.records') AS rs"
        " FROM journal WHERE kind IN ('did', 'changed') AND deleted_at IS NULL"
        " AND json_extract(data, '$.turn') = ? AND json_extract(data, '$.collection') IS NOT NULL",
        (turn_id,))
    pairs: list[tuple[str, str]] = []
    for row in rows:
        if row["r"]:
            pairs.append((str(row["c"]), str(row["r"])))
        for rid in json.loads(row["rs"]) if row["rs"] else []:
            pairs.append((str(row["c"]), str(rid)))
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for key in pairs:
        if key in seen:
            continue
        seen.add(key)
        try:
            rec = world.collections.get(key[0], key[1])
        except Exception:
            continue
        out.append({"collection": key[0], **rec})
    return out


def worth_checking(world: World, turn_id: str) -> bool:
    """A turn is checked when Alpha wrote values it worked out itself (looked up or estimated)
    rather than only what the person stated."""
    if _reply_of(world, turn_id) is None:
        return False
    for rec in records_of(world, turn_id):
        prov = rec.get("_provenance") or {}
        if prov.get("synced") or prov.get("reader"):
            continue  # rows copied from a page are not values Alpha worked out
        if prov.get("by") == "alpha" and prov.get("source") != "stated":
            return True
    return False


def parse_verdict(text: str) -> dict[str, Any]:
    """The judge's JSON, however it was wrapped; an unreadable verdict counts as agreement with
    a note, never as a difference invented by a parsing problem."""
    match = re.search(r"\{.*\}", text, re.S)
    if match:
        try:
            data = json.loads(match.group(0))
            differences = [str(d) for d in data.get("differences") or []]
            unstated = [str(u) for u in data.get("unstated") or []]
            return {"agree": bool(data.get("agree", not differences)) and not differences,
                    "differences": differences, "unstated": unstated}
        except (json.JSONDecodeError, AttributeError, TypeError):
            pass
    return {"agree": True, "differences": [], "unstated": [],
            "note": f"The judge's answer wasn't readable: {text[:200]}"}


def words(verdict: dict[str, Any]) -> str:
    if verdict["agree"] and not verdict["unstated"]:
        return "Checked against an independent answer: it agrees."
    parts: list[str] = []
    if verdict["differences"]:
        parts.append("it differs on " + "; ".join(verdict["differences"]))
    if verdict["unstated"]:
        parts.append("it would have asked or said: " + "; ".join(verdict["unstated"]))
    return "Checked against an independent answer: " + ". ".join(parts) + "."


def _run(runner: turn.Runner, world: World, *, kind: str, system: str, sentence: str,
         turn_id: str, model: str | None) -> RunResult:
    return runner(TurnRequest(sentence=sentence, system=system, world_path=world.path,
                              turn_id=turn_id, kind=kind, model=model))


def check(world: World, turn_id: str, *, sentence: str | None = None,
          runner: turn.Runner = route.run, repair: bool = True,
          model: str | None = None) -> dict[str, Any]:
    """Check one turn's reply. Returns {"checked": bool, "agree": …, "differences": …,
    "unstated": …, "independent": …, "entry": journal id, "repaired": reply or None}."""
    said = world.journal.read(turn_id)
    reply = _reply_of(world, turn_id)
    if reply is None:
        return {"checked": False, "why": "That turn has no reply to check."}
    asked = sentence or said["text"]
    independent = _run(runner, world, kind="independent", system=INDEPENDENT_RULES,
                       sentence=f'The person said: "{asked}"', turn_id=turn_id, model=model)
    if not independent.ok:
        return {"checked": False,
                "why": f"No independent answer came back: {independent.error or 'no reply'}"}
    judged = _run(
        runner, world, kind="judge", system=JUDGE_RULES, turn_id=turn_id, model=model,
        sentence=(f'The sentence: "{asked}"\n\nAlpha\'s answer:\n{reply["text"]}\n\n'
                  f"The independent answer:\n{independent.reply}"),
    )
    if not judged.ok:
        return {"checked": False, "why": f"The comparison failed: {judged.error or 'no reply'}"}
    verdict = parse_verdict(judged.reply)
    entry = world.journal.append(
        "checked", words(verdict),
        data={"turn": turn_id, "reply": reply["id"], **verdict,
              "independent": independent.reply[:2000]},
        module=said["module"], thread=said["thread"],
    )
    result: dict[str, Any] = {"checked": True, **verdict, "independent": independent.reply,
                              "entry": entry, "repaired": None}
    if repair and (verdict["differences"] or verdict["unstated"]):
        outcome = turn.ask(world, repair_prompt(asked, reply["text"], verdict,
                                                records_of(world, turn_id)),
                           module=said["module"], thread=said["thread"], runner=runner,
                           actor="alpha", model=model,
                           journal_as=f'Took the second opinion on the reply to "{asked}".')
        result["repaired"] = outcome.reply if outcome.ok else None
    return result


def repair_prompt(sentence: str, reply: str, verdict: dict[str, Any],
                  records: list[dict[str, Any]]) -> str:
    found = "\n".join(f"- {d}" for d in verdict["differences"]) or "- nothing"
    flagged = "\n".join(f"- {u}" for u in verdict["unstated"]) or "- nothing"
    made = ", ".join(f"{r['collection']} {r['id']} (revision {r['revision']})"
                     for r in records) or "none"
    return (
        f'A second opinion on your reply to "{sentence}". You replied: "{reply}"\n\n'
        f"An independent lookup with web search found these differences:\n{found}\n"
        f"and would have asked or said:\n{flagged}\n\n"
        f"Records this turn made or changed: {made}.\n\n"
        "Where the independent answer rests on a source and is right, correct those records "
        "with records_update (source = the page the values come from) and tell the person in "
        "one or two lines what you corrected and where the number comes from. Where you stand "
        "by your own, say why in one line. If something should have been asked, ask it now. "
        "Plain words, no tool names."
    )
