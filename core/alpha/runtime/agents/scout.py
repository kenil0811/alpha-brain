"""Scout, the recommender (design Q48; built on Q50's substrate, 16 Oct 2026).

Scout looks across everything Alpha holds for things worth the person's attention: something
coming up (a commitment Watson filed, a calendar event with someone Alpha knows), a pattern or
a change in their data, a link between parts of their world (the map's links pass is Scout's
now), a follow-up left open (a question, a proposal, an open line on a page), and something
they could stop doing by hand (the same ask three times or more). Each comes as a short pick
the person can take or leave, at a good moment, never as a stream of pings; it only proposes.

The frame is code, the judgement the model's: once a day, on the first tick after Alpha is
opened (the window's first Home poll of a local day leaves one `saw` line), Scout gathers one
packet by code (what arrived since is in it, not run on arrival) and one turn with Alpha's read
tools picks what matters, in a shape code checks: every piece of evidence must resolve, exactly
one action in plain words, a pick the person declined never returns unless its evidence
changed, a kind declined three times running sinks to its surest picks, picks serving a goal
rank first. The day's picks live on Home with Take and Not now; only a pick that is sure and
costly to miss is also a card in Needs you (the companion's next poll shows it; never mid-turn).
Take is the right owner's doing: Alpha as a turn in the pick's words, the interview for a thing
to stop doing by hand (so Sherlock follows), the map for links. Bolder to start (Kenil): up to
five a day, the less sure ones shown as such. Mac notifications stay later (Q44).
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

from alpha import config
from alpha.config import settings
from alpha.connectors.calendar import Calendar
from alpha.context.summary import module_summary
from alpha.runtime import connecting, route, turn
from alpha.runtime.agents import Outcome, Work, journal_rowid, register, since_cursor, starting
from alpha.runtime.claude_cli import RunResult
from alpha.world.world import World

log = logging.getLogger("alpha.agents.scout")

KIND = "scout"
NAME = "Scout"
DESCRIPTION = ("Scout looks across everything Alpha holds for things worth your attention: a"
               " pattern in your data, a link between parts of your world, something coming up,"
               " something you could stop doing by hand. Each comes as a short suggestion you can"
               " take or leave, at a good moment, never as a stream of pings. It only proposes;"
               " nothing happens without your yes.")
MAY = ["proposals", "notes"]
KINDS = ("coming_up", "pattern", "link", "follow_up", "by_hand")
KIND_WORDS = {"coming_up": "coming up", "pattern": "a pattern in your data",
              "link": "a link in your world", "follow_up": "a follow-up",
              "by_hand": "something to stop doing by hand"}
OPENED = "Alpha opened for the day."


def scout_agent(world: World) -> dict[str, Any] | None:
    return next((a for a in world.agents.all() if a["kind"] == KIND), None)


def today() -> str:
    return datetime.now(UTC).astimezone().date().isoformat()


def _json(text: str) -> Any:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


# ---- the day's opening ----


def note_opened(world: World) -> str | None:
    """The window's first Home poll of a local day leaves one line (`saw`), which wakes Scout
    for the day's picks; None when the day was noted already."""
    day = today()
    if world.preferences.get("opened_on") == day:
        return None
    world.preferences.set("opened_on", day)
    return world.journal.append("saw", OPENED, actor="person", data={"opened": day})


def picked_on(world: World, agent: dict[str, Any], day: str) -> bool:
    return world.store.one(
        "SELECT 1 AS x FROM journal WHERE kind = 'did' AND actor = ? AND deleted_at IS NULL"
        " AND json_extract(data, '$.picks_day') = ?", (agent["id"], day)) is not None


# ---- the packet, by code ----


def _repeated_asks(world: World, days: int = 30) -> list[dict[str, Any]]:
    """Sentences of the same shape the person said three times or more lately (their first
    six words, the numbers aside): things they may be doing by hand."""
    since = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    shapes: dict[str, list[dict[str, Any]]] = {}
    for e in world.journal.recent(300, kinds=["said"], since=since):
        if e["actor"] != "person" or e["text"].startswith("@"):
            continue
        words = re.sub(r"\d[\d.,]*", "#", e["text"].lower()).split()
        if len(words) < 3:
            continue
        shapes.setdefault(" ".join(words[:6]), []).append(e)
    out = []
    for shape, hits in shapes.items():
        if len(hits) >= 3:
            out.append({"shape": shape, "times": len(hits), "last": hits[-1]["text"][:160],
                        "entries": [h["id"] for h in hits[-3:]]})
    return sorted(out, key=lambda r: -r["times"])[:8]


def declined_before(world: World) -> dict[str, list[dict[str, Any]]]:
    """The person's declines of Scout's picks, by the pick's key (kind + subject), with the
    evidence each had: one returns only when its evidence changed."""
    out: dict[str, list[dict[str, Any]]] = {}
    for d in world.decisions.recent(500):
        if d["by"] == "person" and d["about"].get("pick"):
            out.setdefault(str(d["about"]["pick"]), []).append(d)
    return out


def sunk_kinds(world: World) -> set[str]:
    """A kind the person declined `sinks_after` times running, with no take between: only
    its surest picks are shown."""
    runs: dict[str, int] = {}
    sunk: set[str] = set()
    for d in reversed(world.decisions.recent(500)):  # oldest first
        if d["by"] != "person" or not d["about"].get("pick_kind"):
            continue
        kind = str(d["about"]["pick_kind"])
        if d["about"].get("taken"):
            runs[kind] = 0
        else:
            runs[kind] = runs.get(kind, 0) + 1
        if runs[kind] >= settings.scout.sinks_after:
            sunk.add(kind)
        elif kind in sunk and runs[kind] == 0:
            sunk.discard(kind)
    return sunk


def packet(world: World, agent: dict[str, Any]) -> dict[str, Any]:
    """What Scout looks at, gathered by code: the five kinds' raw material, the goals, what
    the person declined before. The model judges; code made the list."""
    now = datetime.now(UTC)
    commitments = world.commitments.due_within(7)
    try:
        events = Calendar(world).between(now.isoformat(), (now + timedelta(hours=48)).isoformat())
    except Exception:
        events = []
    summaries = []
    for m in world.modules.all():
        try:
            summaries.append(module_summary(world, m["id"]))
        except Exception:
            log.exception("scout: summary of %s", m["id"])
    stale = (now - timedelta(days=1)).isoformat()
    open_asks = [a for a in world.journal.open_asks()
                 if a["at"] < stale and a["actor"] != agent["id"]]
    answered = {r["data"].get("proposal") for r in world.journal.recent(200, kinds=["answered"])}
    open_proposals = [p for p in world.journal.recent(50, kinds=["proposed"])
                      if p["id"] not in answered and p["at"] < stale
                      and not p["data"].get("scout") and not p["data"].get("plan")]
    goals = world.knowledge.goals("active")
    return {"day": today(), "commitments": commitments, "events": events[:12],
            "summaries": summaries, "open_asks": open_asks[:10],
            "open_proposals": open_proposals[:10], "repeated": _repeated_asks(world),
            "goals": goals, "declined": declined_before(world), "sunk": sorted(sunk_kinds(world)),
            "facts_suggested": world.knowledge.facts("person", states=("suggested",))[:10]}


def _words(p: dict[str, Any]) -> str:
    lines = [f"Today: {p['day']}", ""]
    lines.append("Commitments due within a week:")
    lines += [f"- {c['id']}: {c['who']} — {c['what']}"
              + (f" (to {c['to_whom']})" if c.get("to_whom") else "") + f", due {c['due']}"
              for c in p["commitments"]] or ["- none"]
    lines += ["", "Calendar, next 48 hours:"]
    lines += [f"- {e.get('id', '')}: {e.get('starts_at', '')[:16]} {e.get('title', '')}"
              + (f" with {', '.join(e.get('people') or [])}" if e.get("people") else "")
              for e in p["events"]] or ["- none"]
    lines += ["", "Tables, this week against last (from the module summaries):"]
    for s in p["summaries"]:
        for t in s.get("tables") or []:
            amounts = "; ".join(f"{a.get('field', '?')}: today {a.get('today')}, this week"
                                f" {a.get('this_week')}, last week {a.get('last_week', '?')}"
                                for a in t.get("amounts") or [])
            lines.append(f"- {s.get('name', '?')} › {t.get('title', t.get('name'))}:"
                         f" {t.get('rows')} rows, {t.get('added_this_week', 0)} added this week"
                         + (f"; {amounts}" if amounts else "")
                         + (f"; latest {t['latest']}" if t.get("latest") else ""))
    if not any(s.get("tables") for s in p["summaries"]):
        lines.append("- none")
    lines += ["", "Left open for more than a day:"]
    lines += [f"- ask {a['id']}: {a['text'][:140]}" for a in p["open_asks"]]
    lines += [f"- proposal {q['id']}: {q['text'][:140]}" for q in p["open_proposals"]]
    if not p["open_asks"] and not p["open_proposals"]:
        lines.append("- nothing")
    lines += ["", "Asked by hand three times or more this month:"]
    lines += [f"- {r['times']}×: \"{r['last']}\" (entries {', '.join(r['entries'])})"
              for r in p["repeated"]] or ["- nothing"]
    lines += ["", "Goals:"]
    lines += [f"- {g['id']}: {g['text']}" for g in p["goals"]] or ["- none set"]
    lines += ["", "Facts Alpha suggested that wait for a yes:"]
    lines += [f"- {f['id']}: {f['predicate']} = {f['value']}" for f in p["facts_suggested"]] \
        or ["- none"]
    if p["declined"]:
        lines += ["", "Picks the person declined before (never again unless the evidence"
                      " changed):"]
        lines += [f"- {key}" for key in list(p["declined"])[:30]]
    if p["sunk"]:
        lines += ["", "Kinds the person keeps declining (only a sure pick):"
                      f" {', '.join(p['sunk'])}"]
    return "\n".join(lines)


# ---- the checks on what comes back ----


def evidence_resolves(world: World, ref: str) -> bool:
    ref = str(ref or "").strip()
    if not ref:
        return False
    if ref.startswith("j_"):
        return world.store.one("SELECT 1 AS x FROM journal WHERE id = ? AND deleted_at IS NULL",
                               (ref,)) is not None
    if ref.startswith("r_"):
        return world.store.one("SELECT 1 AS x FROM records WHERE id = ? AND deleted_at IS NULL",
                               (ref,)) is not None
    if ref.startswith("g_"):
        return world.store.one("SELECT 1 AS x FROM goals WHERE id = ?", (ref,)) is not None
    if ref.startswith("c_"):
        return world.store.one("SELECT 1 AS x FROM commitments WHERE id = ?", (ref,)) is not None
    if ref.startswith("f_"):
        return world.store.one("SELECT 1 AS x FROM facts WHERE id = ?", (ref,)) is not None
    if ref.startswith("e_"):
        return world.store.one("SELECT 1 AS x FROM entities WHERE id = ?", (ref,)) is not None
    if "/" in ref:  # a table's row as table/id, or a page as scope/title
        table, _, rid = ref.partition("/")
        if world.store.one("SELECT 1 AS x FROM records WHERE collection = ? AND id = ?"
                           " AND deleted_at IS NULL", (table, rid)):
            return True
        return world.knowledge.find_note(table, rid) is not None
    return world.store.one("SELECT 1 AS x FROM events WHERE id = ?", (ref,)) is not None


def key_of(kind: str, subject: str) -> str:
    words = re.sub(r"[^a-z0-9]+", "_", (subject or "").lower()).strip("_")[:60]
    return f"{kind}:{words or 'pick'}"


def check_picks(world: World, data: Any, p: dict[str, Any]) -> dict[str, Any]:
    """What code keeps of the model's picks: a known kind, a title and one action, evidence
    that resolves, not declined before with the same evidence, a sunk kind only when sure;
    goal-serving first, then the surest; at most `picks_a_day`."""
    data = data if isinstance(data, dict) else {}
    kept: list[dict[str, Any]] = []
    dropped: list[str] = []
    goals = {g["id"] for g in p["goals"]}
    for raw in data.get("picks") or []:
        if not isinstance(raw, dict):
            continue
        kind = str(raw.get("kind") or "").strip().lower()
        title = " ".join(str(raw.get("title") or "").split())[:120]
        action = " ".join(str(raw.get("action") or "").split())[:300]
        actions = [a for a in re.split(r"\s*;\s*|\s+and then\s+", action) if a]
        if kind not in KINDS or not title:
            continue
        if not action or len(actions) > 1:
            dropped.append(f"{title}: not one clear action")
            continue
        evidence = [str(e).strip() for e in (raw.get("evidence") or []) if str(e).strip()][:6]
        live = [e for e in evidence if evidence_resolves(world, e)]
        if not live:
            dropped.append(f"{title}: its evidence names nothing Alpha holds")
            continue
        try:
            sure = max(0.0, min(1.0, float(raw.get("sure", 0.5))))
            helpful = max(0.0, min(1.0, float(raw.get("helpful", 0.5))))
        except (TypeError, ValueError):
            sure, helpful = 0.5, 0.5
        key = key_of(kind, str(raw.get("subject") or title))
        before = p["declined"].get(key) or []
        if before and set(live) <= set(before[-1].get("evidence", {}).get("evidence") or []):
            dropped.append(f"{title}: you declined it before and nothing changed")
            continue
        if kind in set(p["sunk"]) and sure < 0.8:
            dropped.append(f"{title}: you keep declining this kind; only a sure one shows")
            continue
        goal = str(raw.get("goal") or "") or None
        if goal and goal not in goals:
            goal = None
        kept.append({"kind": kind, "title": title,
                     "what": " ".join(str(raw.get("what") or "").split())[:300],
                     "why": " ".join(str(raw.get("why") or "").split())[:300],
                     "evidence": live, "action": action, "sure": sure, "helpful": helpful,
                     "costly": bool(raw.get("costly_to_miss")),
                     "expires": str(raw.get("expires") or "")[:10] or None,
                     "goal": goal, "key": key, "less_sure": sure < 0.6,
                     "card": bool(raw.get("costly_to_miss")) and sure >= 0.8})
    kept.sort(key=lambda k: (k["goal"] is None, -(k["sure"] * 0.5 + k["helpful"] * 0.5)))
    return {"picks": kept[:settings.scout.picks_a_day],
            "dropped": dropped + [f"{k['title']}: beyond the day's few" for k in
                                  kept[settings.scout.picks_a_day:]]}


# ---- the run ----


def write_picks(world: World, agent: dict[str, Any], day: str, picks: list[dict[str, Any]],
                *, links: int = 0) -> list[str]:
    """The picks as proposals under Scout's name: Home shows the day's, Needs you only the
    sure and costly ones (`card`); Take and Not now decide them."""
    ids = []
    for pick in picks:
        ids.append(world.journal.append(
            "proposed", pick["title"], actor=agent["id"],
            data={"scout": pick, "why": pick["why"], "day": day, "agent": agent["id"],
                  **({"goal": pick["goal"]} if pick["goal"] else {})}))
    if links:
        ids.append(world.journal.append(
            "proposed", f"{links} link{'s' if links != 1 else ''} in your world worth confirming",
            actor=agent["id"],
            data={"scout": {"kind": "link", "title": "Links worth confirming",
                            "what": "Things on your map that look connected.",
                            "why": "the map's links pass found them, with reasons",
                            "evidence": [], "action": "confirm them on the map", "sure": 0.6,
                            "helpful": 0.5, "costly": False, "expires": None, "goal": None,
                            "key": key_of("link", day), "less_sure": True, "card": False,
                            "open": "/intelligence/map"},
                  "why": "the map's links pass found them", "day": day, "agent": agent["id"]}))
    return ids


def picks_of_day(world: World, day: str | None = None) -> list[dict[str, Any]]:
    """The day's picks that are not decided yet (today's, or the latest day's when today has
    none yet), for Home."""
    answered = {r["data"].get("proposal") for r in world.journal.recent(300, kinds=["answered"])}
    mine = [p for p in world.journal.recent(100, kinds=["proposed"]) if p["data"].get("scout")]
    if not mine:
        return []
    latest = day or max(str(p["data"].get("day") or "") for p in mine)
    return [{"id": p["id"], "at": p["at"], "day": p["data"].get("day"), **p["data"]["scout"],
             "decided": p["id"] in answered}
            for p in mine if p["data"].get("day") == latest]


def decide_pick(world: World, proposal: dict[str, Any], accept: bool) -> dict[str, Any]:
    """The person took or declined a pick: a decision of theirs by the pick's key (a decline
    keeps the pick's evidence, so the same pick returns only when it changed), journaled."""
    pick = proposal["data"]["scout"]
    d = world.decisions.record(
        by="person", what=(f"Took Scout's pick: {pick['title']}" if accept
                           else f"Not now: {pick['title']}"),
        why=pick.get("why"), evidence={"evidence": pick.get("evidence") or [],
                                       "proposal": proposal["id"]},
        about={"pick": pick["key"], "pick_kind": pick["kind"], "taken": accept,
               **({"goal": pick["goal"]} if pick.get("goal") else {})})
    world.journal.append("did", f"You {'took' if accept else 'left'} Scout's pick:"
                                f" {pick['title']}.", actor="person",
                         data={"proposal": proposal["id"], "pick": pick["key"], "taken": accept})
    return d


def _note(world: World, agent: dict[str, Any], kind: str, line: str) -> None:
    day = datetime.now().astimezone().strftime("%-d %b %Y")
    try:
        world.knowledge.append_to_page(f"agent:{agent['id']}", "Notes", KIND_WORDS.get(kind, kind),
                                       f"{day}: {line}"[:300])
    except Exception:
        log.exception("scout: note under %s", kind)


def pick_the_day(world: World, agent: dict[str, Any], *, runner: turn.Runner = route.run,
                 day: str | None = None) -> dict[str, Any]:
    """The day's picks: the packet by code, the links pass by code, one turn with the read
    tools judging, the checks, the picks written. {"ok", "picks", "dropped", "links",
    "model_ms", "why"}."""
    day = day or today()
    p = packet(world, agent)
    links = 0
    try:
        found = connecting.connect(world, runner=runner)
        links = len(found.get("proposed") or [])
    except Exception as e:
        log.warning("scout: the links pass: %s", e)
    outcome = turn.ask(world, "Pick what deserves the person's attention today.\n\n" + _words(p),
                       thread=agent["thread"], runner=runner,
                       rules=config.prompt("scout_picks", name=agent["name"]), actor=agent["id"],
                       agent=agent["id"],
                       journal_as="Scout looks across the world for today's picks.")
    model_ms = int(outcome.result.duration_ms or 0)
    if not outcome.ok:
        return {"ok": False, "why": outcome.result.error or outcome.reply, "picks": [],
                "dropped": [], "links": links, "model_ms": model_ms}
    checked = check_picks(world, _json(outcome.reply), p)
    ids = write_picks(world, agent, day, checked["picks"], links=links)
    world.journal.append("did", f"Scout's picks for {day}: {len(checked['picks'])}"
                                f"{' and the map' if links else ''}; {len(checked['dropped'])}"
                                " left out by the checks.", actor=agent["id"],
                         thread=agent["thread"], data={"agent": agent["id"], "picks_day": day,
                                                       "picks": ids,
                                                       "dropped": checked["dropped"]})
    by_kind: dict[str, int] = {}
    for pick in checked["picks"]:
        by_kind[pick["kind"]] = by_kind.get(pick["kind"], 0) + 1
    for kind, n in by_kind.items():
        _note(world, agent, kind, f"{n} shown")
    return {"ok": True, "picks": checked["picks"], "dropped": checked["dropped"], "links": links,
            "model_ms": model_ms, "ids": ids}


# ---- the frame ----


def look(world: World, agent: dict[str, Any]) -> Work | None:
    """Alpha opened for a day Scout has not picked for yet."""
    entries = since_cursor(world, agent, kinds=["saw"])
    upto = journal_rowid(world)
    days = [str(e["data"]["opened"]) for e in entries if e["data"].get("opened")]
    about: dict[str, Any] = {}
    if days and not picked_on(world, agent, days[-1]):
        about["day"] = days[-1]
    return Work(upto, about)


def run(world: World, agent: dict[str, Any], work: Work | None, *,
        runner: turn.Runner = route.run) -> Outcome:
    if work is None:
        work = Work(journal_rowid(world), {"day": today()})
    day = str(work.about.get("day") or today())
    starting(world, agent, f"Looking across your world for {day}'s picks: what is coming up,"
                           " patterns, links, follow-ups, things to stop doing by hand.")
    out = pick_the_day(world, agent, runner=runner, day=day)
    if not out["ok"]:
        return Outcome("failed", str(out.get("why")), None, out["model_ms"], upto=work.upto)
    n = len(out["picks"])
    kinds = sorted({KIND_WORDS[p["kind"]] for p in out["picks"]})
    line = (f"{n} pick{'s' if n != 1 else ''} for today ({', '.join(kinds)})" if n
            else "Nothing worth your attention today")
    if out["links"]:
        line += f"; {out['links']} link{'s' if out['links'] != 1 else ''} on the map to confirm"
    if out["dropped"]:
        line += f"; {len(out['dropped'])} left out by the checks"
    return Outcome("succeeded", None, line + ".", out["model_ms"], upto=work.upto)


def mention(world: World, agent: dict[str, Any], sentence: str, *, thread: str | None,
            module: str | None = None, runner: turn.Runner = route.run,
            on_said: Any = None) -> turn.TurnOutcome | None:
    """"@Scout …": today's picks made now and said in the conversation."""
    agent_row = world.agents.get(agent["id"])
    if not agent_row.get("thread"):
        t = world.modules.open_thread(agent["name"], "job", agent.get("module"))["id"]
        world.agents.set_thread(agent["id"], t)
        agent_row = world.agents.get(agent["id"])
    said = world.journal.append("said", sentence, actor="person", module=module, thread=thread)
    if on_said is not None:
        on_said(said)
    run_id = world.runs.start(agent["id"], trigger="mention")
    out = pick_the_day(world, agent_row, runner=runner)
    if out["ok"]:
        reply = ("Today's picks: " + "; ".join(p["title"] for p in out["picks"])
                 + ". They're on Home with Take and Not now." if out["picks"]
                 else "I looked across your world: nothing worth your attention today.")
        verdict = "succeeded"
    else:
        reply, verdict = f"I couldn't look today: {out.get('why')}", "failed"
    replied = world.journal.append("replied", reply, actor=agent["id"], data={"turn": said},
                                   module=module, thread=thread)
    world.runs.finish(run_id, verdict=verdict, why=None if out["ok"] else reply,
                      line=reply[:2000], model_ms=out["model_ms"])
    return turn.TurnOutcome(reply=reply, ok=out["ok"], said=said, replied=replied,
                            result=RunResult(reply=reply, ok=out["ok"]))


register(KIND, look, run, mention, words={
    "works": "once a day, on the first time you open Alpha, over everything that arrived since"
             " (nothing runs when data arrives); the map's Refresh is its links pass; and when"
             " you @-mention it",
    "good_run": "its picks came back and passed the checks (evidence that resolves, one clear"
                " action, nothing you declined before), or it said plainly that nothing was"
                " worth your attention; failed when no answer came back"})
