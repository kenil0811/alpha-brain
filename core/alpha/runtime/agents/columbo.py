"""Columbo, the checker (design Q47; built on Q50's substrate, 16 Oct 2026).

Columbo double-checks what Alpha works out: the values it writes that it looked up or
estimated, the numbers in an answer the person will rely on (a measurement, a price, a
percentage), the values a workflow's parts fill (on a part's first row, and again after Doc
repairs it), and the numbers in anything outward before the yes. Two ways, each a model's
judgement inside a frame of code: against the outside (the person's sentence answered again by
the same model with web search and nothing of Alpha's, then a judging run comparing the two) and
against the person's world (a judging run given what Alpha held when it answered: the matches
for the sentence, the people it names, the rows the turn wrote). Alpha is trusted the way a good
assistant is trusted; the check keeps it honest.

Columbo never fixes. A difference on an answer goes to Alpha as a turn of its own: it corrects
the record from the source and says so in a line, or says why it stands by its own. When the
sources still disagree after that, or when the difference is on a value a part filled (which no
agent owns), the person is asked once, with both values and their sources; their answer binds (a
decision of theirs, the value kept as their edit, no model turn). What was checked carries a mark
(`_provenance.checked`; the window shows ✓ or ≠ with the source on hover); an outward card shows
Columbo's line and is never held up. Its notes, written by code, say per source whether it agreed
and per kind of value how often Alpha was wrong.

Before 16 Oct this was `runtime/check.py`, the second opinion: one way, after turns that wrote
worked-out values, with nothing around it. `alpha check <turn>` still runs it by hand.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from alpha import config
from alpha.config import settings
from alpha.context.prepack import section_of
from alpha.runtime import route, turn
from alpha.runtime.agents import Outcome, Work, journal_rowid, register, since_cursor, starting
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.store import Problem, now
from alpha.world.world import World

log = logging.getLogger("alpha.agents.columbo")

KIND = "columbo"
NAME = "Columbo"
DESCRIPTION = ("Columbo double-checks what Alpha works out: numbers it looked up or estimated,"
               " answers you'll rely on, and what goes out in your name. It checks them against"
               " an independent source and against what's already in your world. When something"
               " doesn't add up, it says so, and the right agent corrects it with the source. It"
               " never changes anything itself.")
MAY = ["notes"]
OUTSIDE = "an independent answer"
WORLD = "your world"
# the independent answer's own words when the sentence holds nothing it can look up
NOTHING = "NOTHING TO LOOK UP"
# A number the person will rely on, by shape: a measurement with its unit, money, a percentage.
# A bare count ("3 meetings") or a date is left alone: those are the person's own, which no
# outside source knows.
UNITS = (r"kcal|cal|kj|kg|mg|mcg|g|lbs?|oz|ml|cl|litres?|liters?|l|km|miles?|mi|cm|mm|m|ft|"
         r"percent|%|°[cf]|mph|km/h")
NUMBER_SHAPES = re.compile(
    rf"(?:[£$€₹]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:{UNITS})(?![a-z])"
    r"|\b(?:usd|gbp|eur|inr)\s?\d|\d\s?(?:usd|gbp|eur|inr)\b)", re.I)
NUMBER = re.compile(r"-?\d[\d,]*(?:\.\d+)?")
# a value that is a number and nothing else, with at most a unit or a currency around it
BARE_NUMBER = re.compile(r"[£$€₹]?\s*-?\d[\d,]*(?:\.\d+)?\s*[a-z%/]*", re.I)


def columbo_agent(world: World) -> dict[str, Any] | None:
    """Columbo's row in this world, or None in a world that has none yet (then a check by hand
    runs as Alpha's own, as the second opinion did)."""
    return next((a for a in world.agents.all() if a["kind"] == KIND), None)


def carries_numbers(text: str) -> bool:
    return bool(NUMBER_SHAPES.search(text or ""))


def is_number(value: Any) -> bool:
    """A value a part filled that can be looked up again: a number, or words carrying one."""
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    return isinstance(value, str) and carries_numbers(value)


# ---- what a turn wrote ----


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


def worked_out(world: World, turn_id: str) -> list[dict[str, Any]]:
    """The records of a turn whose values Alpha worked out itself (looked up or estimated),
    rather than only what the person stated or a reader copied from a page."""
    out = []
    for rec in records_of(world, turn_id):
        prov = rec.get("_provenance") or {}
        if prov.get("synced") or prov.get("reader"):
            continue
        if prov.get("by") == "alpha" and prov.get("source") != "stated":
            out.append(rec)
    return out


def worth_checking(world: World, turn_id: str) -> bool:
    """A turn is checked when Alpha wrote values it worked out itself."""
    if world.journal.reply_of(turn_id) is None:
        return False
    return bool(worked_out(world, turn_id))


def checked_before(world: World, turn_id: str) -> bool:
    """Whether this turn's reply was checked already (a card's or a part's check names the
    turn too, but is not the reply's)."""
    return world.store.one(
        "SELECT 1 AS x FROM journal WHERE kind = 'checked' AND deleted_at IS NULL"
        " AND json_extract(data, '$.turn') = ? AND json_extract(data, '$.action') IS NULL"
        " AND json_extract(data, '$.part') IS NULL", (turn_id,)) is not None


# ---- a verdict ----


def _json(text: str) -> Any:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _difference(raw: Any) -> dict[str, Any]:
    """One difference as the frame keeps it: what, Alpha's value, the other's, its source,
    and the words for the person; from the judge's object or its sentence."""
    if isinstance(raw, dict):
        what = " ".join(str(raw.get("what") or "").split())
        alpha = " ".join(str(raw.get("alpha") or "").split())
        other = " ".join(str(raw.get("independent") or raw.get("world") or raw.get("other")
                             or "").split())
        source = " ".join(str(raw.get("source") or raw.get("where") or "").split())
        words = f"{what}: Alpha {alpha}, {'independent' if 'independent' in raw else 'world'}" \
                f" {other}" + (f" ({source})" if source else "")
        return {"what": what, "alpha": alpha, "other": other, "source": source,
                "words": words if what else " ".join(str(raw).split())}
    text = " ".join(str(raw).split())
    m = re.match(r"(?P<what>[^:]+):\s*Alpha\s+(?P<alpha>.+?),\s*(?:independent|world|your world)"
                 r"\s+(?P<other>.+?)(?:\s*\((?P<source>[^)]+)\))?$", text, re.I)
    if m:
        return {"what": m["what"].strip(), "alpha": m["alpha"].strip(),
                "other": m["other"].strip(), "source": (m["source"] or "").strip(),
                "words": text}
    return {"what": text.split(":", 1)[0].strip() if ":" in text else "", "alpha": "",
            "other": "", "source": "", "words": text}


def parse_verdict(text: str) -> dict[str, Any]:
    """The judge's JSON, however it was wrapped; an unreadable verdict counts as agreement with
    a note, never as a difference invented by a parsing problem."""
    data = _json(text)
    if isinstance(data, dict):
        differences = [_difference(d) for d in data.get("differences") or []]
        unstated = [str(u) for u in data.get("unstated") or []]
        out: dict[str, Any] = {"agree": bool(data.get("agree", not differences))
                               and not differences,
                               "differences": differences, "unstated": unstated}
        note = " ".join(str(data.get("note") or "").split())
        if note:
            out["note"] = note
        return out
    return {"agree": True, "differences": [], "unstated": [],
            "note": f"The judge's answer wasn't readable: {text[:200]}"}


def _way_words(verdict: dict[str, Any] | None, against: str) -> str:
    if verdict is None:
        return f"against {against}: no answer came back"
    if str(verdict.get("note") or "").startswith("nothing to look up"):
        return f"against {against}: nothing to look up"
    if verdict["agree"] and not verdict["unstated"]:
        return f"against {against}: it agrees"
    parts: list[str] = []
    if verdict["differences"]:
        parts.append("it differs on " + "; ".join(d["words"] for d in verdict["differences"]))
    if verdict["unstated"]:
        parts.append("it would have asked or said: " + "; ".join(verdict["unstated"]))
    return f"against {against}: " + ". ".join(parts)


def words(result: dict[str, Any]) -> str:
    """The verdict in a line: both ways, or the one that answered."""
    outside, world = result.get("outside"), result.get("world")
    if outside is not None and world is not None and outside["agree"] and world["agree"] \
            and not outside["unstated"] \
            and not str(outside.get("note") or "").startswith("nothing to look up"):
        return f"Checked against {OUTSIDE} and {WORLD}: both agree."
    return ("Checked " + _way_words(outside, OUTSIDE) + "; " + _way_words(world, WORLD)
            + ".")


def _differences(result: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for way in ("outside", "world"):
        verdict = result.get(way)
        for d in (verdict or {}).get("differences") or []:
            out.append({**d, "way": way})
    return out


# ---- the two ways ----


def _run(runner: turn.Runner, world: World, *, kind: str, system: str, sentence: str,
         turn_id: str, model: str | None) -> RunResult:
    role = "independent" if kind == "independent" else "judge"
    return runner(TurnRequest(sentence=sentence, system=system, world_path=world.path,
                              turn_id=turn_id, kind=kind, model=model or config.model_for(role)))


def _earlier(world: World, said: dict[str, Any]) -> str:
    """The person's own earlier sentences where the turn sits, a conversation or the stream
    (theirs, never Alpha's replies or records): what "it" and "that one" mean to an answer
    given alone."""
    where: dict[str, Any] = ({"thread": said["thread"]} if said.get("thread")
                             else {"stream": True})
    before = [e["text"] for e in world.journal.recent(12, kinds=["said"], **where)
              if e["actor"] == "person" and e["at"] <= said["at"] and e["id"] != said["id"]
              and not e["text"].startswith("@")]
    if not before:
        return ""
    return ("Earlier in the same conversation the person said: "
            + "; ".join(f'"{t[:300]}"' for t in before[-4:]) + "\n\n")


def _outside(world: World, asked: str, answer: str, turn_id: str, runner: turn.Runner,
             model: str | None, *, values: bool = False, earlier: str = "",
             ) -> tuple[dict[str, Any] | None, str, str | None]:
    """The outside way: the sentence answered again with web search and nothing of Alpha's
    (or, for `values` a part filled, the values looked up again), then judged against Alpha's
    answer. (verdict or None, the independent answer, why not)."""
    independent = _run(runner, world, kind="independent",
                       system=config.prompt("columbo_values" if values else "check_independent"),
                       sentence=asked if values else f'{earlier}The person said: "{asked}"',
                       turn_id=turn_id, model=model)
    if not independent.ok:
        return None, "", f"no independent answer came back: {independent.error or 'no reply'}"
    if independent.reply.strip().upper().startswith(NOTHING):
        # the sentence holds nothing the outside can know (the person's own file, a judgement):
        # there is no second opinion to compare, and no judge to ask (by code, not by the
        # judge's reading: 16 Oct, the small model kept listing questions as "unstated")
        why = " ".join(independent.reply.strip()[len(NOTHING):].strip(" :—-.\n").split())
        return ({"agree": True, "differences": [], "unstated": [],
                 "note": "nothing to look up" + (f": {why[:200]}" if why else "")},
                independent.reply, None)
    judged = _run(runner, world, kind="judge", system=config.prompt("check_judge"),
                  turn_id=turn_id, model=model,
                  sentence=(f'The sentence: "{asked}"\n\nAlpha\'s answer:\n{answer}\n\n'
                            f"The independent answer:\n{independent.reply}"))
    if not judged.ok:
        return None, independent.reply, f"the comparison failed: {judged.error or 'no reply'}"
    return parse_verdict(judged.reply), independent.reply, None


def _record_words(rec: dict[str, Any]) -> str:
    prov = rec.get("_provenance") or {}
    values = ", ".join(f"{k} = {v}" for k, v in rec.items()
                       if not k.startswith("_") and k not in ("id", "revision", "created_at",
                                                              "updated_at", "collection")
                       and v not in (None, "", []))
    rests = "estimated" if prov.get("estimated") else (f"from {prov['source']}"
                                                       if prov.get("source") else "")
    if prov.get("assumed"):
        rests += f"; assumed {prov['assumed']}"
    return f"- record {rec['id']} in {rec['collection']}: {values}" + (f" ({rests})" if rests
                                                                         else "")


def _world(world: World, asked: str, answer: str, turn_id: str, held: list[str],
           runner: turn.Runner, model: str | None) -> tuple[dict[str, Any] | None, str | None]:
    """The world way: Alpha's answer judged against what the person's world held when it
    answered (`held`, lines the frame gathered). A world with nothing to say agrees without a
    model call. (verdict or None, why not)."""
    if not held:
        return {"agree": True, "differences": [], "unstated": [],
                "note": "nothing in your world speaks to it"}, None
    judged = _run(runner, world, kind="judge", system=config.prompt("columbo_world"),
                  turn_id=turn_id, model=model,
                  sentence=(f'The sentence: "{asked}"\n\nAlpha\'s answer:\n{answer}\n\n'
                            f"What the person's world held:\n" + "\n".join(held)[:6000]))
    if not judged.ok:
        return None, f"the world's comparison failed: {judged.error or 'no reply'}"
    verdict = parse_verdict(judged.reply)
    verdict["unstated"] = []  # the world has nothing to ask; that is the outside way's
    return verdict, None


def _held_for_turn(world: World, turn_id: str, records: list[dict[str, Any]]) -> list[str]:
    """What Alpha held when it answered: the matches for the sentence and the people it names,
    from the context kept with the turn; the rows the turn wrote, as they are now."""
    kept = world.journal.context(turn_id)
    context = str(kept["context"]) if kept else ""
    held: list[str] = []
    matches = section_of(context, "MATCHES FOR THIS SENTENCE")
    if matches:
        held.append("Matches for the sentence (before this turn):\n" + matches[:2500])
    named = section_of(context, "WHO THE SENTENCE NAMES")
    if named:
        held.append("Who the sentence names:\n" + named[:1500])
    if records:
        shown = records[:settings.columbo.rows_shown]
        lines = [_record_words(r)[:300] for r in shown]
        if len(records) > len(shown):
            lines.append(f"- … and {len(records) - len(shown)} more rows this turn wrote, not"
                         " shown here")
        held.append("Rows this turn wrote:\n" + "\n".join(lines))
    return held


# ---- marks, notes, asks ----


def _mark(world: World, agent: dict[str, Any] | None, rec: dict[str, Any], *, agree: bool,
          source: str, entry: str | None, field: str | None = None) -> None:
    checked = {"at": now(), "by": agent["id"] if agent else "alpha", "agree": agree,
               "source": " ".join(source.split())[:160], "entry": entry}
    try:
        world.collections.mark_checked(rec["collection"], rec["id"], checked, field=field)
    except Problem:
        pass  # the row went meanwhile; nothing to mark


def _note(world: World, agent: dict[str, Any] | None, heading: str, line: str) -> None:
    """Columbo's notes, written by code: one dated line per check, under the source's or the
    value's heading."""
    if agent is None or not heading:
        return
    day = datetime.now().astimezone().strftime("%-d %b %Y")
    try:
        world.knowledge.append_to_page(f"agent:{agent['id']}", "Notes", heading[:60],
                                       f"{day}: {line}"[:300])
    except Exception:
        log.exception("columbo: note under %s", heading)


def _who(d: dict[str, Any], *, world_words: str = "your world") -> str:
    """Which way a difference came from, in the notes' words."""
    return "the independent answer" if d["way"] == "outside" else world_words


def _host(source: str) -> str:
    """A source's heading in the notes: its site, from a web address or a few words naming
    the page ("label on ocado.com" → ocado.com)."""
    text = (source or "").strip()
    if not text:
        return ""
    if re.match(r"^https?://", text, re.I):
        return urlparse(text).netloc.removeprefix("www.") or text
    m = re.search(r"\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b", text, re.I)
    return m.group(1).lower() if m else text[:40]


def _same(a: Any, b: Any) -> bool:
    """Two values the same thing: equal numbers (the words around them aside), or the same
    words."""
    na, nb = NUMBER.search(str(a or "")), NUMBER.search(str(b or ""))
    if na and nb:
        try:
            return float(na.group(0).replace(",", "")) == float(nb.group(0).replace(",", ""))
        except ValueError:
            pass
    return " ".join(str(a or "").split()).casefold() == " ".join(str(b or "").split()).casefold()


def _field_of(world: World, rec: dict[str, Any], difference: dict[str, Any]) -> str | None:
    """The field of a record a difference is about: named by the difference, or holding
    Alpha's value from it. None when the record is not the one."""
    try:
        fields = world.collections.describe(rec["collection"])["fields"]
    except Problem:
        return None
    what = difference.get("what", "").casefold()

    def names_it(f: dict[str, Any]) -> bool:
        name, label = f["name"].casefold(), str(f.get("label") or "").casefold()
        return bool(what) and (name in what or what in name or bool(label) and label in what)

    named: list[str] = [str(f["name"]) for f in fields if names_it(f)]
    if named:
        if len(named) == 1 or not difference.get("alpha"):
            return named[0]
        hit = next((n for n in named if _same(rec.get(n), difference["alpha"])), None)
        return hit or named[0]
    if BARE_NUMBER.fullmatch(difference.get("alpha", "").strip()):
        return next((str(f["name"]) for f in fields if f["kind"] == "number"
                     and rec.get(f["name"]) is not None
                     and _same(rec.get(f["name"]), difference["alpha"])), None)
    return None


def _as_field(world: World, collection: str, field: str, value: Any) -> Any:
    """A chosen value as the field keeps it: a number field takes the number out of the
    judge's words ("48,100" → 48100)."""
    try:
        kind = next(f["kind"] for f in world.collections.describe(collection)["fields"]
                    if f["name"] == field)
    except (Problem, StopIteration):
        return value
    if kind == "number" and not isinstance(value, (int, float)):
        m = NUMBER.search(str(value))
        if m:
            number = float(m.group(0).replace(",", ""))
            return int(number) if number.is_integer() else number
    return value


def _label(world: World, collection: str, field: str) -> str:
    try:
        f = next(f for f in world.collections.describe(collection)["fields"]
                 if f["name"] == field)
    except (Problem, StopIteration):
        return field.replace("_", " ")
    return str(f.get("label") or f["name"].replace("_", " "))


def _title(world: World, rec: dict[str, Any]) -> str:
    try:
        desc = world.collections.describe(rec["collection"])
    except Problem:
        return str(rec["id"])
    return str(rec.get(desc["title_field"]) or rec["id"])


def _open_ask_about(world: World, rec: dict[str, Any], field: str) -> bool:
    return any(a["data"].get("columbo", {}).get("record") == rec["id"]
               and a["data"]["columbo"].get("field") == field for a in world.journal.open_asks())


def ask_person(world: World, agent: dict[str, Any] | None, rec: dict[str, Any], field: str,
               alpha_value: Any, other_value: Any, source: str, *, entry: str | None,
               said: dict[str, Any] | None = None, part: str | None = None) -> str | None:
    """The one question Columbo asks: two values for one field, each with its source; the
    person's pick binds (`decide`). Asked once per field; an open one is not repeated."""
    if _open_ask_about(world, rec, field):
        return None
    label = _label(world, rec["collection"], field)
    title = _title(world, rec)
    who = "Alpha" if part is None else f"the part {part}"
    choices = {str(alpha_value): {"value": alpha_value, "source": "what " + who + " had"},
               str(other_value): {"value": other_value, "source": source or OUTSIDE}}
    text = (f"{label[:1].upper()}{label[1:]} of {title}: {who} has {alpha_value},"
            f" {source or OUTSIDE} says {other_value}. Which should Alpha keep?")
    return world.journal.append(
        "asked", text, actor=agent["id"] if agent else "alpha",
        data={"options": list(choices), "turn": said["id"] if said else None,
              "columbo": {"collection": rec["collection"], "record": rec["id"], "field": field,
                          "choices": choices, "entry": entry, "part": part}},
        module=said["module"] if said else None, thread=said["thread"] if said else None)


def decide(world: World, asked: dict[str, Any], answer: str) -> dict[str, Any] | None:
    """The person answered one of Columbo's questions: their pick is a decision of theirs
    (binding), the value is kept on the record as their own edit when it differs, the mark
    says it agrees with what they chose; no model turn. None when the question is not
    Columbo's or the answer is neither value (then it is a message like any other)."""
    about = (asked.get("data") or {}).get("columbo")
    if not about:
        return None
    choices: dict[str, dict[str, Any]] = about.get("choices") or {}
    key = next((k for k in choices if _same(k, answer)), None)
    if key is None:
        return None
    chosen = choices[key]
    collection, rid, field = about["collection"], about["record"], about["field"]
    agent = columbo_agent(world)
    try:
        rec = world.collections.get(collection, rid)
    except Problem:
        return None
    title = _title(world, {"collection": collection, **rec})
    label = _label(world, collection, field)
    source = str(chosen.get("source") or "")
    changed = not _same(rec.get(field), chosen.get("value"))
    if changed:
        prior = rec.get("_provenance") or {}
        prov: dict[str, Any] = {"by": "person", "turn": None, "source": source,
                                "estimated": False}
        if prior.get("fields"):
            # a part's row: the other fields keep their origins; this one is the person's now
            fields = dict(prior["fields"])
            fields[field] = {k: v for k, v in (fields.get(field) or {}).items()
                             if k in ("part", "attempts")} | {"source": source,
                                                               "fetched_at": now()}
            prov["fields"] = fields
        rec = world.collections.update(collection, rid,
                                       {field: _as_field(world, collection, field,
                                                         chosen["value"])},
                                       rec["revision"], prov)
        world.journal.append(
            "changed", f"You kept {label} = {chosen['value']} for {title} ({source}).",
            actor="person", data={"collection": collection, "record": rid, "ask": asked["id"],
                                  "field": field},
            module=asked.get("module"), thread=asked.get("thread"))
    decision = world.decisions.record(
        by="person", what=f"Keep {label} = {chosen['value']} for {title} ({source})",
        why="Alpha and the source disagreed; Columbo asked",
        alternatives=[k for k in choices if k != key],
        evidence={"ask": asked["id"], "check": about.get("entry")},
        about={"collection": collection, "record": rid, "field": field,
               **({"agent": agent["id"]} if agent else {}),
               **({"part": about["part"]} if about.get("part") else {})})
    _mark(world, agent, {"collection": collection, **rec}, agree=True, source=source,
          entry=about.get("entry"), field=field if about.get("part") else None)
    took_side = not source.startswith("what ")
    _note(world, agent, field, "you took Columbo's side" if took_side
          else "you kept Alpha's own value")
    return {"decision": decision, "record": rec, "changed": changed}


# ---- an answer ----


def repair_prompt(sentence: str, reply: str, result: dict[str, Any],
                  records: list[dict[str, Any]]) -> str:
    outside = result.get("outside") or {}
    world = result.get("world") or {}
    found = "\n".join(f"- {d['words']}" for d in outside.get("differences") or []) or "- nothing"
    held = "\n".join(f"- {d['words']}" for d in world.get("differences") or []) or "- nothing"
    flagged = "\n".join(f"- {u}" for u in outside.get("unstated") or []) or "- nothing"
    made = ", ".join(f"{r['collection']} {r['id']} (revision {r['revision']})"
                     for r in records) or "none"
    return (
        f'A second opinion on your reply to "{sentence}". You replied: "{reply}"\n\n'
        f"An independent lookup with web search found these differences:\n{found}\n"
        f"and would have asked or said:\n{flagged}\n\n"
        f"The person's own records disagree on:\n{held}\n\n"
        f"Records this turn made or changed: {made}.\n\n"
        "Where the independent answer rests on a source and is right, correct those records "
        "with records_update (source = the page the values come from) and tell the person in "
        "one or two lines what you corrected and where the number comes from. Where your own "
        "records disagree, say which is right and why. Where you stand by your own, say why in "
        "one line. If something should have been asked, ask it now. Plain words, no tool names."
    )


def check_turn(world: World, turn_id: str, *, sentence: str | None = None,
               runner: turn.Runner = route.run, repair: bool = True,
               model: str | None = None, agent: dict[str, Any] | None = None,
               ) -> dict[str, Any]:
    """Check one turn's reply both ways. Returns {"checked": bool, "agree": both agree,
    "outside": verdict or None, "world": verdict or None, "differences": [...], "unstated":
    [...], "independent": the answer, "entry": journal id, "repaired": Alpha's correction or
    None, "asked": the questions put to the person, "failed": the ways that gave no answer}."""
    agent = agent if agent is not None else columbo_agent(world)
    said = world.journal.read(turn_id)
    reply = world.journal.reply_of(turn_id)
    if reply is None:
        return {"checked": False, "why": "That turn has no reply to check."}
    asked = sentence or said["text"]
    records = worked_out(world, turn_id)
    outside, independent, why_outside = _outside(world, asked, reply["text"], turn_id, runner,
                                                 model, earlier=_earlier(world, said))
    world_verdict, why_world = _world(world, asked, reply["text"], turn_id,
                                      _held_for_turn(world, turn_id, records), runner, model)
    failed = [w for w, why in (("outside", why_outside), ("world", why_world)) if why]
    if outside is None and world_verdict is None:
        return {"checked": False, "why": f"{why_outside}; {why_world}", "failed": failed}
    result: dict[str, Any] = {"checked": True, "outside": outside, "world": world_verdict,
                              "independent": independent, "repaired": None, "asked": [],
                              "failed": failed, "records": len(records)}
    result["differences"] = _differences(result)
    result["unstated"] = list((outside or {}).get("unstated") or [])
    result["agree"] = not result["differences"] and not result["unstated"] and not failed
    actor = agent["id"] if agent else "alpha"
    entry = world.journal.append(
        "checked", words(result), actor=actor,
        data={"turn": turn_id, "reply": reply["id"], "agree": result["agree"],
              "differences": [d["words"] for d in result["differences"]],
              "unstated": result["unstated"], "independent": independent[:2000],
              "outside": outside, "world": world_verdict, "failed": failed,
              **({"agent": agent["id"]} if agent else {})},
        module=said["module"], thread=said["thread"])
    result["entry"] = entry
    # the mark on every row the turn worked out: agreed, or differing on one of its fields
    touched: dict[str, list[tuple[dict[str, Any], str]]] = {}
    for d in result["differences"]:
        for rec in records:
            f = _field_of(world, rec, d)
            if f:
                touched.setdefault(rec["id"], []).append((d, f))
                break
    against = f"{OUTSIDE} and {WORLD}" if outside and world_verdict else (
        OUTSIDE if outside else WORLD)
    for rec in records:
        hits = touched.get(rec["id"])
        _mark(world, agent, rec, agree=not hits, entry=entry,
              source=(hits[0][0]["source"] or against) if hits else against)
    _notes_for_turn(world, agent, asked, result)
    if repair and (result["differences"] or result["unstated"]):
        outcome = turn.ask(world, repair_prompt(asked, reply["text"], result, records),
                           module=said["module"], thread=said["thread"], runner=runner,
                           actor="alpha", model=model,
                           journal_as=f'Took the second opinion on the reply to "{asked}".')
        result["repaired"] = outcome.reply if outcome.ok else None
        # Alpha corrected from the source, or stood by its own: then the person decides.
        for rid, hits in touched.items():
            rec = next(r for r in records if r["id"] == rid)
            try:
                fresh = {"collection": rec["collection"], **world.collections.get(rec["collection"],
                                                                                  rid)}
            except Problem:
                continue
            for d, f in hits:
                if _same(fresh.get(f), d["other"]):
                    _mark(world, agent, fresh, agree=True, source=d["source"] or against,
                          entry=entry)
                    _note(world, agent, f, f"Alpha corrected it from {d['source'] or OUTSIDE}")
                elif _same(fresh.get(f), d["alpha"]) and d["other"]:
                    jid = ask_person(world, agent, fresh, f, fresh.get(f), d["other"],
                                     d["source"] or (OUTSIDE if d["way"] == "outside"
                                                     else "your own records"),
                                     entry=entry, said=said)
                    if jid:
                        result["asked"].append(jid)
                        _note(world, agent, f, "Alpha stood by its own; asked you")
    return result


def _notes_for_turn(world: World, agent: dict[str, Any] | None, asked: str,
                    result: dict[str, Any]) -> None:
    """Per source, whether it agreed with Alpha; per kind of value, that Alpha was wrong."""
    outside = result.get("outside")
    if outside is not None:
        sources = {_host(d["source"]) for d in outside["differences"] if d["source"]}
        for host in sorted(sources):
            _note(world, agent, host, f"differed with Alpha on \"{asked[:60]}\"")
        if outside["agree"]:
            _note(world, agent, "Sources", f"an independent answer agreed on \"{asked[:60]}\"")
    for d in result.get("differences") or []:
        if d["what"]:
            _note(world, agent, d["what"], f"Alpha had {d['alpha'] or '?'}, {_who(d)}"
                                           f" {d['other'] or '?'}")


# ---- a part's values ----


def _repaired_at(world: World, part_id: str) -> str | None:
    row = world.store.one(
        "SELECT MAX(at) AS at FROM journal WHERE kind = 'changed' AND deleted_at IS NULL"
        " AND json_extract(data, '$.part') = ? AND json_extract(data, '$.repair') IS NOT NULL",
        (part_id,))
    return str(row["at"]) if row and row["at"] else None


def part_checked(world: World, module_id: str, part_id: str) -> bool:
    """Whether this part's values were checked since it was last repaired (one check per
    part on its first filled row; again after Doc's fix)."""
    row = world.store.one(
        "SELECT MAX(at) AS at FROM journal WHERE kind = 'checked' AND deleted_at IS NULL"
        " AND json_extract(data, '$.part') = ? AND module = ?", (part_id, module_id))
    checked_at = str(row["at"]) if row and row["at"] else None
    if checked_at is None:
        return False
    repaired = _repaired_at(world, part_id)
    return repaired is None or repaired < checked_at


def _siblings(world: World, collection: str, rid: str, part_id: str,
              fields: list[str]) -> list[str]:
    """Other rows the same part filled, for the world way (a part giving every row the same
    number is a difference the outside cannot see)."""
    out: list[str] = []
    try:
        desc = world.collections.describe(collection)
        rows = world.collections.query(collection, limit=500)
    except Problem:
        return out
    for row in rows:
        if row["id"] == rid:
            continue
        origins = (row.get("_provenance") or {}).get("fields") or {}
        if not any((origins.get(f) or {}).get("part") == part_id for f in fields):
            continue
        values = ", ".join(f"{f} = {row.get(f)}" for f in fields if row.get(f) is not None)
        out.append(f"- {row.get(desc['title_field']) or row['id']}: {values}")
        if len(out) >= settings.columbo.sibling_rows:
            break
    return out


def check_part(world: World, agent: dict[str, Any] | None, module_id: str, part_id: str,
               record: str, collection: str, *, runner: turn.Runner = route.run,
               model: str | None = None) -> dict[str, Any]:
    """Check the values a part filled on one row, both ways: looked up again outside, and
    against the row's own other values and the rows the part filled before. No agent owns a
    part's values, so a difference asks the person; each checked field carries the mark."""
    from alpha.runtime import parts as parts_module

    module = world.modules.get(module_id)
    part = next((p for p in parts_module.parts_of(module.get("workspace")) if p["id"] == part_id),
                None)
    if part is None:
        return {"checked": False, "why": f"the module has no part {part_id} any more"}
    try:
        row = world.collections.get(collection, record)
        desc = world.collections.describe(collection)
    except Problem as e:
        return {"checked": False, "why": str(e)}
    origins = (row.get("_provenance") or {}).get("fields") or {}
    filled = [f for f in part["fills"]["fields"]
              if is_number(row.get(f)) and (origins.get(f) or {}).get("part") == part_id]
    if not filled:
        return {"checked": False, "why": "the part filled no number on this row"}
    title = str(row.get(desc["title_field"]) or record)
    others = ", ".join(f"{k} = {v}" for k, v in row.items()
                       if not k.startswith("_") and k not in filled
                       and k not in ("id", "revision", "created_at", "updated_at")
                       and v not in (None, "", []))[:600]
    lines = []
    for f in filled:
        origin = origins.get(f) or {}
        fetched = f", fetched {str(origin['fetched_at'])[:10]}" if origin.get("fetched_at") else ""
        lines.append(f"- {f} = {row[f]} (from {origin.get('source') or part['title']}{fetched})")
    values = "\n".join(lines)
    sentence = (f"The thing: {title}" + (f" ({others})" if others else "") + "\n\nThe values"
                f" filled by the part \"{part['title']}\":\n{values}")
    outside, independent, why_outside = _outside(world, sentence, values, f"part:{part_id}",
                                                 runner, model, values=True)
    held = _siblings(world, collection, record, part_id, filled)
    if held:
        held = [f"Other rows the part \"{part['title']}\" filled before:"] + held
    world_verdict, why_world = _world(world, sentence, values, f"part:{part_id}", held, runner,
                                      model)
    failed = [w for w, why in (("outside", why_outside), ("world", why_world)) if why]
    if outside is None and world_verdict is None:
        return {"checked": False, "why": f"{why_outside}; {why_world}", "failed": failed}
    result: dict[str, Any] = {"checked": True, "outside": outside, "world": world_verdict,
                              "independent": independent, "asked": [], "failed": failed}
    result["differences"] = _differences(result)
    result["unstated"] = list((outside or {}).get("unstated") or [])
    result["agree"] = not result["differences"] and not failed
    actor = agent["id"] if agent else "alpha"
    entry = world.journal.append(
        "checked", f"The part {part['title']} on {title}: " + words(result)[0].lower()
        + words(result)[1:], actor=actor,
        data={"part": part_id, "module": module_id, "record": record, "collection": collection,
              "agree": result["agree"], "differences": [d["words"] for d in result["differences"]],
              "unstated": result["unstated"], "independent": independent[:2000],
              "outside": outside, "world": world_verdict, "failed": failed,
              **({"agent": agent["id"]} if agent else {})},
        module=module_id)
    result["entry"] = entry
    rec = {"collection": collection, **row}
    against = f"{OUTSIDE} and {WORLD}" if outside and world_verdict else (
        OUTSIDE if outside else WORLD)
    differing: dict[str, dict[str, Any]] = {}
    for d in result["differences"]:
        f = _field_of(world, rec, d)
        if f and f in filled and f not in differing:
            differing[f] = d
    for f in filled:
        d = differing.get(f)
        _mark(world, agent, rec, agree=d is None, source=(d or {}).get("source") or against,
              entry=entry, field=f)
        if d and d["other"]:
            jid = ask_person(world, agent, rec, f, row.get(f), d["other"],
                             d["source"] or (OUTSIDE if d["way"] == "outside"
                                             else "the rows filled before"),
                             entry=entry, part=part["title"])
            if jid:
                result["asked"].append(jid)
    for f, d in differing.items():
        _note(world, agent, f, f"the part {part['title']} had {d['alpha'] or row.get(f)},"
                               f" {_who(d, world_words='the other rows')} {d['other'] or '?'}")
    if not differing:
        _note(world, agent, part["title"], f"agreed on {title}")
    return result


# ---- an outward card ----


def check_action(world: World, agent: dict[str, Any] | None, action_id: str, *,
                 runner: turn.Runner = route.run, model: str | None = None) -> dict[str, Any]:
    """The numbers in an outward card, checked before the yes: against the person's world
    (what the proposing turn held and wrote, the matches for the words) and outside for facts.
    The card shows Columbo's line; nothing is held up."""
    try:
        action = world.actions.get(action_id)
    except Problem as e:
        return {"checked": False, "why": str(e)}
    if action["state"] != "proposed":
        return {"checked": False, "why": "it was decided before Columbo looked"}
    text = "\n".join(f"{k}: {v}" for k, v in action["payload"].items())
    asked = f"{action['title']}" + (f" ({action['evidence']})" if action.get("evidence") else "")
    turn_id = action.get("turn")
    records = records_of(world, turn_id) if turn_id else []
    held = _held_for_turn(world, turn_id, records) if turn_id else []
    hits = [f"- record {h['id']} in {h['collection']}: {h['snippet']}"
            for h in world.collections.search(text, 5)]
    if hits:
        held.append("Rows that match the words:\n" + "\n".join(hits))
    world_verdict, why_world = _world(world, asked, text, f"action:{action_id}", held, runner,
                                      model)
    outside, independent, why_outside = _outside(world, asked, text, f"action:{action_id}",
                                                 runner, model)
    failed = [w for w, why in (("outside", why_outside), ("world", why_world)) if why]
    if outside is None and world_verdict is None:
        return {"checked": False, "why": f"{why_outside}; {why_world}", "failed": failed}
    result: dict[str, Any] = {"checked": True, "outside": outside, "world": world_verdict,
                              "independent": independent, "failed": failed}
    result["differences"] = _differences(result)
    result["unstated"] = list((outside or {}).get("unstated") or [])
    result["agree"] = not result["differences"] and not failed
    line = words(result)
    world.actions.set_checked(action_id, line)
    entry = world.journal.append(
        "checked", f"{action['title']}: {line[0].lower()}{line[1:]}",
        actor=agent["id"] if agent else "alpha",
        data={"action": action_id, "turn": turn_id, "agree": result["agree"],
              "differences": [d["words"] for d in result["differences"]],
              "unstated": result["unstated"], "independent": independent[:2000],
              "outside": outside, "world": world_verdict, "failed": failed,
              **({"agent": agent["id"]} if agent else {})},
        module=action.get("module"), thread=action.get("thread"))
    result["entry"] = entry
    for d in result["differences"]:
        if d["what"]:
            _note(world, agent, d["what"], f"in \"{action['title']}\": Alpha {d['alpha'] or '?'},"
                                           f" {_who(d)} {d['other'] or '?'}")
    return result


# ---- the frame: look, run, mention ----


def look(world: World, agent: dict[str, Any]) -> Work | None:
    """What came since Columbo last looked: Alpha's replies to the person that carry numbers
    or wrote worked-out values, a part's first filled row (or its first since a repair), and
    an outward card whose payload carries numbers."""
    entries = since_cursor(world, agent, kinds=["replied", "did", "proposed"])
    upto = journal_rowid(world)
    turns: list[str] = []
    parts: list[dict[str, Any]] = []
    actions: list[str] = []
    seen_parts: set[tuple[str, str]] = set()
    for e in entries:
        d = e["data"]
        if e["kind"] == "replied" and e["actor"] == "alpha" and d.get("turn"):
            try:
                said = world.journal.read(str(d["turn"]))
            except Problem:
                continue
            if said["kind"] != "said" or said["actor"] != "person":
                continue  # Alpha's own turns (a correction, a repair) are not checked again
            tid = said["id"]
            if tid in turns or checked_before(world, tid):
                continue
            if worth_checking(world, tid) or carries_numbers(e["text"]):
                turns.append(tid)
        elif e["kind"] == "did" and d.get("part") and d.get("record") and e["module"] \
                and any(is_number(v) for v in (d.get("values") or {}).values()):
            key = (str(e["module"]), str(d["part"]))
            if key in seen_parts or part_checked(world, key[0], key[1]):
                continue
            seen_parts.add(key)
            parts.append({"module": key[0], "part": key[1], "record": str(d["record"]),
                          "collection": str(d.get("collection") or "")})
        elif e["kind"] == "proposed" and d.get("action"):
            try:
                action = world.actions.get(str(d["action"]))
            except Problem:
                continue
            if action["state"] == "proposed" and carries_numbers(
                    " ".join(str(v) for v in action["payload"].values())):
                actions.append(action["id"])
    about: dict[str, Any] = {}
    if turns:
        about["turns"] = turns
    if parts:
        about["parts"] = parts
    if actions:
        about["actions"] = actions
    return Work(upto, about)


def run(world: World, agent: dict[str, Any], work: Work | None, *,
        runner: turn.Runner = route.run) -> Outcome:
    """Columbo's run over what `look` found: each thing checked both ways; the line counts
    what agreed, what differed and what was put to the person; the verdict by whether the
    ways answered (succeeded when both did for everything, partial when one did not, failed
    when nothing was checked)."""
    if work is None:
        work = look(world, agent) or Work(journal_rowid(world))
    about = work.about
    checked = {"answers": 0, "parts": 0, "cards": 0}
    agreed = differed = asked = corrected = 0
    partial: list[str] = []  # one of the two ways gave no answer
    nothing: list[str] = []  # nothing could be checked

    def count(kind: str, name: str, out: dict[str, Any]) -> None:
        nonlocal agreed, differed, asked, corrected
        if not out.get("checked"):
            nothing.append(f"{name} ({out.get('why')})")
            return
        checked[kind] += 1
        if out.get("failed"):
            partial.append(name)
        if out.get("differences") or out.get("unstated"):
            differed += 1
        else:
            agreed += 1
        asked += len(out.get("asked") or [])
        if out.get("repaired") and out.get("differences") and not out.get("asked"):
            corrected += 1

    for tid in about.get("turns") or []:
        try:
            said = world.journal.read(tid)
        except Problem:
            continue
        starting(world, agent, f'Checking the reply to "{said["text"][:60]}" against an'
                               f" independent answer and your world.", turn=tid)
        count("answers", f'the reply to "{said["text"][:50]}"',
              check_turn(world, tid, runner=runner, agent=agent))
    for item in about.get("parts") or []:
        starting(world, agent, f"Checking the part {_part_title(world, item)} on its first"
                               " filled row against an independent answer and the rows before"
                               " it.", part=item["part"], module=item["module"])
        count("parts", f"the part {item['part']}",
              check_part(world, agent, item["module"], item["part"], item["record"],
                         item["collection"], runner=runner))
    for aid in about.get("actions") or []:
        try:
            title = world.actions.get(aid)["title"]
        except Problem:
            continue
        starting(world, agent, f'Checking the numbers in "{title}" before your yes.', action=aid)
        count("cards", "an outward card", check_action(world, agent, aid, runner=runner))
    total = sum(checked.values())
    if not total:
        if nothing:
            return Outcome("failed", "; ".join(nothing)[:300], "Nothing could be checked.")
        return Outcome("succeeded", None, "Nothing to check.")
    things = [f"{n} {name if n != 1 else name[:-1]}" for name, n in checked.items() if n]
    found = []
    if differed == 0:
        found.append("all agree" if total > 1 else "it agrees")
    else:
        found.append(f"{agreed} agree{'s' if agreed == 1 else ''}, {differed} differ"
                     f"{'s' if differed == 1 else ''}")
    if corrected:
        found.append(f"Alpha corrected {corrected}")
    if asked:
        found.append(f"asked you about {asked}")
    line = f"Checked {' and '.join(things)}: {'; '.join(found)}."
    if partial:
        return Outcome("partial", f"one way gave no answer for {', '.join(partial)}", line)
    if nothing:
        return Outcome("partial", "; ".join(nothing)[:300], line)
    return Outcome("succeeded", None, line)


def _part_title(world: World, item: dict[str, Any]) -> str:
    from alpha.runtime import parts as parts_module

    try:
        ws = world.modules.get(item["module"]).get("workspace")
        part = next((p for p in parts_module.parts_of(ws) if p["id"] == item["part"]), None)
    except Problem:
        part = None
    return str((part or {}).get("title") or item["part"])


def _last_answer(world: World, thread: str | None) -> str | None:
    """The person's last turn with a reply in this conversation (or the stream)."""
    kwargs: dict[str, Any] = {"thread": thread} if thread else {"stream": True}
    for e in reversed(world.journal.recent(20, kinds=["said"], **kwargs)):
        if e["actor"] == "person" and not e["text"].strip().startswith("@") \
                and world.journal.reply_of(e["id"]) is not None:
            return str(e["id"])
    return None


def mention(world: World, agent: dict[str, Any], sentence: str, *, thread: str | None,
            module: str | None = None, runner: turn.Runner = route.run,
            on_said: Any = None) -> turn.TurnOutcome | None:
    """"@Columbo check that": the conversation's last answer checked again, now, and the
    verdict said there in Columbo's name. None when there is nothing to check (then the
    generic mention answers)."""
    target = _last_answer(world, thread)
    if target is None:
        return None
    said = world.journal.append("said", sentence, actor="person", module=module, thread=thread)
    if on_said is not None:
        on_said(said)
    run_id = world.runs.start(agent["id"], trigger="mention")
    try:
        out = check_turn(world, target, runner=runner, agent=agent)
    except Exception as e:
        log.exception("columbo mention")
        out = {"checked": False, "why": str(e)}
    if out.get("checked"):
        reply = words(out)
        if out.get("repaired"):
            reply += f" Alpha: {out['repaired']}"
        if out.get("asked"):
            reply += " I've asked you which to keep."
        verdict = "partial" if out.get("failed") else "succeeded"
    else:
        reply = f"I couldn't check it: {out.get('why')}."
        verdict = "failed"
    replied = world.journal.append("replied", reply, actor=agent["id"],
                                   data={"turn": said, "checked": out.get("entry")},
                                   module=module, thread=thread)
    world.runs.finish(run_id, verdict=verdict, why=None if verdict == "succeeded"
                      else str(out.get("why") or out.get("failed")), line=reply[:2000])
    return turn.TurnOutcome(reply=reply, ok=bool(out.get("checked")), said=said,
                            replied=replied, result=RunResult(reply=reply, ok=True))


register(KIND, look, run, mention, words={
    "works": "after a turn of yours in which Alpha worked a number out or wrote one it looked"
             " up or estimated, on a workflow part's first filled row (and again after Doc"
             " repairs it), and before an outward card that carries numbers",
    "good_run": "both ways answered for everything it checked (an independent answer and your"
                " world), whatever they found; partial when one way gave no answer; failed"
                " when nothing could be checked"})
