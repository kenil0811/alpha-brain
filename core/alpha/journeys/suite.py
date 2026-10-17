"""Run the journeys in `journeys/*.yaml` against a copy of a world and write a report.

A journey file:

    name: branded_food
    title: A branded food is logged from its label, not guessed
    steps:
      - say: "i had a 45g bar of cadbury dairy milk"      # a turn, as the person
        module: Nutrition
      - reader: {name: linkedin_connections, into: linkedin_connections, key: profile_url}
      - agent: "Daily deal tracker"                        # run one agent now, by name
      - approve_action: latest   # (in steps_after) the person's yes to the newest action
      - seed: {kind: turn, ago: 1d, said: "…", replied: "…"}   # a past exchange
      - seed: {kind: fact, predicate: height_cm, value: "178"}      # a known fact
      - remove_module: "Car Wash Site Scoring"   # the world without something it already has
    checks:
      - independent: {}                     # the second opinion on the last turn agrees
      - row: {collection: food_log, source_not: [estimated]}   # a row this journey added
      - near: {collection: food_log, field: calories, value: 240, within: 0.1}
      - no_new_tables: {}
      - no_new_modules: {}
      - workflow: {state: drafted, steps_min: 2}
      - reply: {matches: "\\n\\s*1[.)]"}     # regex on the last reply (or `contains`)
      - judge: "Did the answer name people from the connections table, or say plainly none?"
      - judge: {rubric: "…", history: 1}   # the judge also sees the previous exchange
      - count: {collection: linkedin_connections, at_least_fraction_of_last_ok: 0.95,
                reader: linkedin_connections}
      - reader_health: linkedin_connections
      - agent: {title: "Daily deal tracker", result_matches: "Read \\d+ of \\d+",
                     problem_allowed: "sign-in|automated reading"}
      - journal: {kind: saw, url_contains: mail.google.com}   # an entry since the journey began

Every step and check is timed; every verdict says why. The world the suite runs on is a copy
(SQLite's backup, plus the browser profiles so signed-in sites read as the person), made in a
scratch directory the report names; the person's own world is never touched.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from datetime import datetime as dt
from pathlib import Path
from typing import Any

import yaml

from alpha import config
from alpha.context import prepack
from alpha.runtime import acting, claude_cli, pipeline, route, turn
from alpha.runtime.agents import builtin, columbo, look_and_run
from alpha.runtime.agents import runner as agent_runner
from alpha.world import purge
from alpha.world.store import Problem, now
from alpha.world.world import World, default_world_path

log = logging.getLogger(__name__)

APP_HOME = Path.home() / "Library" / "Application Support" / "com.alpha.brain"


def journeys_dir() -> Path:
    configured = os.environ.get("ALPHA_JOURNEYS")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[3] / "journeys"


def load(names: list[str] | None = None, folder: Path | None = None) -> list[dict[str, Any]]:
    folder = folder or journeys_dir()
    out = []
    for path in sorted(folder.glob("*.yaml")):
        try:
            data = yaml.safe_load(path.read_text()) or {}
        except yaml.YAMLError as e:
            raise Problem(f"The journey file {path.name} isn't valid YAML: {e}") from e
        data.setdefault("name", path.stem)
        if names and data["name"] not in names:
            continue
        out.append(data)
    if names:
        missing = set(names) - {j["name"] for j in out}
        if missing:
            raise Problem(f"No journey named {', '.join(sorted(missing))} in {folder}.")
    return out


# ---- the copy ----


def _titled(sg: dict[str, Any]) -> str:
    """A suggestion's title, with who brought it when an agent did."""
    return str(sg["title"]) + (f" [{sg.get('by_name')}]" if sg.get("by") else "")


def fresh_home(source_world: Path, into: Path) -> Path:
    """A scratch ALPHA_HOME with a new, empty world (the first-day sentences of the harness
    design §17 start from nothing) and the app's browser profiles, so a sign-in the person made
    holds. Returns the new world's path."""
    into.mkdir(parents=True, exist_ok=True)
    target = into / "world.sqlite"
    _copy_profiles(source_world, into)
    return target


def copy_home(source_world: Path, into: Path) -> Path:
    """A scratch ALPHA_HOME holding a consistent copy of the world and the browser profiles.
    Returns the copied world's path."""
    into.mkdir(parents=True, exist_ok=True)
    target = into / "world.sqlite"
    src = sqlite3.connect(f"file:{source_world}?mode=ro", uri=True)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    _copy_profiles(source_world, into)
    return target


def _copy_profiles(source_world: Path, into: Path) -> None:
    profiles = source_world.parent / "browser"
    if profiles.is_dir():
        try:
            shutil.copytree(profiles, into / "browser", dirs_exist_ok=True,
                            ignore_dangling_symlinks=True,
                            ignore=shutil.ignore_patterns("Singleton*", "lockfile", "*.lock",
                                                          "RunningChromeVersion"))
        except shutil.Error as e:  # a file Chrome had open vanished mid-copy: not a cookie
            log.warning("profile copy skipped %d files: %s", len(e.args[0]), e.args[0][:2])
    (into / "logs").mkdir(exist_ok=True)


# ---- running ----


@dataclass
class Mark:
    """Where a journey began: what existed before it, to judge what it added."""
    at: str
    tables: set[str]
    modules: set[str]
    skills: dict[str, int]


def mark(world: World) -> Mark:
    return Mark(
        at=now(),  # UTC, like every `at` and `created_at` in the world
        tables={t["name"] for t in world.collections.overview()},
        modules={m["id"] for m in world.modules.all()},
        skills={s["name"]: s["version"] for s in world.skills.all()},
    )


@dataclass
class Outcome:
    name: str
    title: str
    steps: list[dict[str, Any]] = field(default_factory=list)
    checks: list[dict[str, Any]] = field(default_factory=list)
    seconds: float = 0.0
    error: str | None = None

    @property
    def passed(self) -> bool:
        return self.error is None and all(c["ok"] for c in self.checks)


class Run:
    def __init__(self, world: World, runner: turn.Runner = route.run) -> None:
        self.world = world
        self.runner = runner
        self.last_turn: str | None = None
        self.last_reply: str = ""
        self.exchanges: list[tuple[str, str]] = []  # (said, reply) in order, this journey
        self.last_agent: dict[str, Any] | None = None
        self.last_action: dict[str, Any] | None = None
        self.last_row: tuple[str, str] | None = None
        builtin.ensure(world)
        self.mark = mark(world)

    # steps

    def step(self, spec: dict[str, Any]) -> dict[str, Any]:
        began = time.monotonic()
        if "say" in spec:
            outcome = turn.ask(self.world, spec["say"], module=spec.get("module"),
                               runner=self.runner)
            self.last_turn, self.last_reply = outcome.said, outcome.reply
            self.exchanges.append((spec["say"], outcome.reply))
            if outcome.ok:
                # What the app's kick does after a person's turn: Watson looks and runs, in line.
                try:
                    look_and_run(self.world, "watson", runner=self.runner)
                except Exception as e:  # a journey is not failed by Watson's pass
                    log.warning("watson in journey: %s", e)
            record = {"say": spec["say"], "ok": outcome.ok, "reply": outcome.reply[:600],
                      "steps": outcome.result.num_turns}
        elif "reader" in spec:
            r = spec["reader"]
            out = pipeline.run_reader(self.world, r["name"], r["into"], r["key"],
                                      keep=r.get("keep"))
            record = {"reader": r["name"], "ok": out.get("health") == "ok",
                      "health": out.get("health"), "detail": out.get("problem") or out.get("line")}
        elif "agent" in spec:
            agent = self._agent(spec["agent"])
            self.last_agent = agent_runner.run(self.world, agent["id"], trigger="now",
                                               runner=self.runner)
            record = {"agent": agent["name"], "ok": not self.last_agent.get("last_error"),
                      "result": self.last_agent.get("last_result"),
                      "problem": self.last_agent.get("last_error")}
        elif "break_reader" in spec:
            # A reader broken on purpose on the copy (its script returns nothing), so the
            # journey can watch Doc repair it with the real model (Q49, 16 Oct).
            name = str(spec["break_reader"])
            reader = self.world.readers.get(name)
            self.world.readers.save(name, site=reader["site"], url=reader["url"],
                                    script="return []", description=reader["description"],
                                    to_end=bool(reader.get("to_end")), count=0,
                                    whole=bool(reader.get("whole", True)), by="journey")
            record = {"break_reader": name, "ok": True}
        elif "seed" in spec:
            # Something that was true before the journey began: a past exchange, a fact.
            seed = spec["seed"]
            if seed.get("kind") == "turn":
                days = int(str(seed.get("ago", "1d")).rstrip("d"))
                at = (dt.now(UTC) - timedelta(days=days)).replace(microsecond=0).isoformat()
                said = self.world.journal.append("said", seed["said"], actor="person")
                replied = self.world.journal.append("replied", seed["replied"],
                                                    data={"turn": said})
                with self.world.store.tx() as db:
                    db.execute("UPDATE journal SET at = ? WHERE id IN (?, ?)", (at, said, replied))
                record = {"seed": f"{days} day(s) ago: {seed['said'][:60]}", "ok": True}
            elif seed.get("kind") == "fact":
                self.world.knowledge.record_fact("person", seed["predicate"], seed["value"],
                                                 source="stated", state="accepted")
                record = {"seed": f"fact {seed['predicate']} = {seed['value']}", "ok": True}
            else:
                raise Problem(f"Unknown seed: {seed}")
            # Seeds are not the journey's own work: move the mark past them.
            self.mark = mark(self.world)
        elif "remove_module" in spec:
            # The world as it would be without something the person already has, for a
            # journey that asks for it afresh; not the journey's own work, so the mark moves.
            # A world that never had it is already that world.
            try:
                counts = purge.remove_module(self.world, spec["remove_module"])
                removed: dict[str, Any] = {k: v for k, v in counts.items() if k != "module"}
            except Problem:
                removed = {"already absent": True}
            record = {"remove_module": spec["remove_module"], "ok": True, "removed": removed}
            self.mark = mark(self.world)
        elif "approve_action" in spec:
            pending = [a for a in self.world.actions.all(("proposed",))
                       if a["created_at"] >= self.mark.at]
            if not pending:
                raise Problem("No action was proposed in this journey to approve.")
            action = sorted(pending, key=lambda a: a["created_at"])[-1]
            done = acting.approve(self.world, action["id"], "Approved by the journey suite",
                                  runner=self.runner, repair=False)
            self.last_action = self.world.actions.get(action["id"])
            record = {"approve_action": action["title"], "ok": bool(done.get("ok")),
                      "detail": done.get("text") or done.get("why")}
        elif "agree_workflow" in spec:
            # The person's yes on the page, as the app's route does it; Alpha then does the
            # work in the conversation, as one turn (harness 2a).
            new = [w for w in self.world.workflows.all(("drafted",))
                   if w["created_at"] >= self.mark.at]
            if not new:
                raise Problem("No workflow was drafted in this journey to agree.")
            agreed = self.world.workflows.agree(new[-1]["id"], "Agreed by the journey suite")
            doing = turn.ask(
                self.world, f"The person agreed the page \"{agreed['title']}\". Do the work"
                            " now, here, as one piece: make what the page says, run it once,"
                            " and report what it holds.",
                thread=agreed.get("conversation"), actor="alpha", runner=self.runner,
                conversation=True, journal_as=f"Agreed: {agreed['title']}. Doing it now.")
            final = self.world.workflows.get(agreed["id"])
            record = {"agree_workflow": agreed["title"], "ok": final["state"] == "built",
                      "state": final["state"], "reply": doing.reply}
        elif "add_row" in spec:
            # A thing added as the person would, then the parts that run when it arrives.
            # `table` names it; `field` finds the newest module's table that has that field
            # (the page names things in its own words).
            a = spec["add_row"]
            table = self._table(a["table"]) if a.get("table") else self._table_with(a["field"])
            row = self.world.collections.add(table, a["values"], {"by": "person"})
            self.last_row = (table, str(row["id"]))
            record = {"add_row": table, "ok": True}
        elif "decline_workflow" in spec:
            new = [w for w in self.world.workflows.all(("drafted", "agreed"))
                   if w["created_at"] >= self.mark.at]
            if not new:
                raise Problem("No workflow was drafted in this journey to decline.")
            out = self.world.workflows.decline(new[-1]["id"])
            record = {"decline_workflow": out["title"], "ok": out["state"] == "declined"}
        else:
            raise Problem(f"Unknown step: {spec}")
        record["seconds"] = round(time.monotonic() - began, 1)
        return record

    def _table(self, name: str) -> str:
        names = self.world.collections.names()
        if name in names:
            return name
        hits = [n for n in names if n.endswith("_" + name)]
        if len(hits) != 1:
            raise Problem(f"{len(hits)} tables match '{name}'.")
        return hits[0]

    def _table_with(self, field: str) -> str:
        new = [m for m in self.world.modules.all() if m["id"] not in self.mark.modules]
        for m in reversed(new):
            for t in self.world.collections.overview(m["id"]):
                desc = self.world.collections.describe(t["name"])
                if any(f["name"] == field for f in desc["fields"]):
                    return str(t["name"])
        raise Problem(f"No table of a module made in this journey has a field '{field}'.")

    def _agent(self, title: str) -> dict[str, Any]:
        hits = [a for a in self.world.agents.all()
                if title.lower() in a["name"].lower() or title.lower() in a["description"].lower()]
        if len(hits) != 1:
            raise Problem(f"{len(hits)} agents match '{title}'.")
        return hits[0]

    # checks

    def check(self, spec: dict[str, Any]) -> dict[str, Any]:
        (kind, arg), = spec.items()
        began = time.monotonic()
        method = getattr(self, f"check_{kind}", None)
        if method is None:
            raise Problem(f"Unknown check: {kind}")
        try:
            ok, why = method(arg if arg is not None else {})
        except Problem as e:
            ok, why = False, str(e)
        return {"check": kind, "arg": arg, "ok": ok, "why": why,
                "seconds": round(time.monotonic() - began, 1)}

    def _new_rows(self, collection: str) -> list[dict[str, Any]]:
        return [r for r in self.world.collections.query(collection, limit=None)
                if r["created_at"] >= self.mark.at]

    def check_independent(self, arg: dict[str, Any]) -> tuple[bool, str]:
        if not self.last_turn:
            return False, "No turn to check."
        result = columbo.check_turn(self.world, self.last_turn, runner=self.runner, repair=False)
        if not result["checked"]:
            return False, result["why"]
        return bool(result["agree"]), columbo.words(result)

    def check_row(self, arg: dict[str, Any]) -> tuple[bool, str]:
        rows = self._new_rows(arg["collection"])
        if not rows:
            return False, f"No row was added to {arg['collection']}."
        bad = [s for s in arg.get("source_not", [])
               if any((r.get("_provenance") or {}).get("source") == s for r in rows)]
        if bad:
            return False, f"A new row's source is {', '.join(bad)}."
        sources = sorted({str((r.get("_provenance") or {}).get("source")) for r in rows})
        return True, f"{len(rows)} row(s) added; source: {', '.join(sources)}."

    def check_near(self, arg: dict[str, Any]) -> tuple[bool, str]:
        rows = self._new_rows(arg["collection"])
        values: list[float] = [float(r[arg["field"]]) for r in rows
                               if isinstance(r.get(arg["field"]), int | float)]
        if not values:
            return False, f"No new row in {arg['collection']} has a number in {arg['field']}."
        target, within = float(arg["value"]), float(arg.get("within", 0.1))
        hit = [v for v in values if abs(v - target) <= within * target]
        words = (f"{arg['field']} = {', '.join(str(v) for v in values)}"
                 f" (wanted {target} ±{within:.0%})")
        return bool(hit), words

    def check_made_since(self, arg: dict[str, Any]) -> tuple[bool, str]:
        """What the journey made: at least `tables`, `readers`, `agents`, `modules` (counts),
        whatever Alpha chose to call them (the first-day sentences, harness design §17)."""
        tables = [c for c in self._tables_since()]
        readers = [k for k in self.world.skills.all("read")
                   if k.get("created_at", "") >= self.mark.at]
        agents = [a for a in self.world.agents.all() if a.get("created_at", "") >= self.mark.at]
        modules = [m for m in self.world.modules.all() if m.get("created_at", "") >= self.mark.at]
        have = {"tables": len(tables), "readers": len(readers), "agents": len(agents),
                "modules": len(modules)}
        short = [f"{k}: {have[k]} of {v}" for k, v in arg.items() if have.get(k, 0) < int(v)]
        words = ", ".join(f"{have[k]} {k}" for k in ("tables", "readers", "agents", "modules"))
        return (not short, f"Made {words}" + (f"; short on {', '.join(short)}" if short else ""))

    def check_rows_since(self, arg: dict[str, Any]) -> tuple[bool, str]:
        """The rows in the tables the journey made add up to at least `at_least`."""
        counts = {c["name"]: int((self.world.store.one(
            "SELECT COUNT(*) AS n FROM records WHERE collection = ?",
            (c["name"],)) or {"n": 0})["n"])
            for c in self._tables_since()}
        total = sum(counts.values())
        words = ", ".join(f"{n} ({c})" for n, c in counts.items()) or "no table"
        return total >= int(arg["at_least"]), f"{total} rows in {words}"

    def _tables_since(self) -> list[dict[str, Any]]:
        """The person's tables made in this journey (a module's settings table is Alpha's)."""
        rows = self.world.store.all(
            "SELECT name, created_at FROM collections WHERE created_at >= ?"
            " AND name != 'settings'", (self.mark.at,))
        return [dict(r) for r in rows]

    def check_no_new_tables(self, arg: dict[str, Any]) -> tuple[bool, str]:
        new = {t["name"] for t in self.world.collections.overview()} - self.mark.tables
        return not new, ("No table was made." if not new else f"Made tables: {sorted(new)}.")

    def check_no_new_skills(self, arg: dict[str, Any]) -> tuple[bool, str]:
        """Alpha used the know-how it had: no reader, procedure or pipeline was written or
        rewritten in this journey (a reuse with the same version is what passes)."""
        current = {s["name"]: s["version"] for s in self.world.skills.all()}
        new = sorted(n for n in current if n not in self.mark.skills)
        changed = sorted(n for n, v in current.items()
                         if n in self.mark.skills and v != self.mark.skills[n])
        if new or changed:
            return False, (f"Wrote new skills: {new}. " if new else "") + \
                (f"Rewrote: {changed}." if changed else "")
        return True, "No skill was written or rewritten."

    def check_no_new_modules(self, arg: dict[str, Any]) -> tuple[bool, str]:
        new = {m["id"] for m in self.world.modules.all()} - self.mark.modules
        return not new, ("No module was made." if not new else f"Made {len(new)} module(s).")

    def check_workflow(self, arg: dict[str, Any]) -> tuple[bool, str]:
        """A workflow page drafted in this journey (§12), in the state asked, with at least
        `steps_min` steps, `keeps_min` things kept, `suggestions_min` suggestions (`sherlock_min`
        of them an agent's, Q45), and, when
        given, `version` (exactly) or `version_min` (a change landed, however many revisions
        the model took to get it right)."""
        new = [w for w in self.world.workflows.all() if w["created_at"] >= self.mark.at]
        if not new:
            return False, "No workflow page was drafted."
        wf = new[-1]
        b = wf["body"]
        by_agents = [sg for sg in b["suggestions"] if sg.get("by")]
        ok = (wf["state"] == arg.get("state", "drafted")
              and len(b["steps"]) >= int(arg.get("steps_min") or 0)
              and len(b["keeps"]) >= int(arg.get("keeps_min") or 0)
              and len(b["suggestions"]) >= int(arg.get("suggestions_min") or 0)
              and len(by_agents) >= int(arg.get("sherlock_min") or 0)
              and (not arg.get("version") or wf["version"] == int(arg["version"]))
              and wf["version"] >= int(arg.get("version_min") or 0))
        steps = "; ".join(f"{s['title']} ({s['who']}{', asks' if s['outward'] else ''})"
                          for s in b["steps"])
        return ok, (f"'{wf['title']}' v{wf['version']} is {wf['state']}: {len(b['steps'])} steps:"
                    f" {steps}. Keeps {', '.join(k['thing'] for k in b['keeps']) or 'nothing'}."
                    f" {len(b['suggestions'])} suggestions ({len(by_agents)} Sherlock's):"
                    f" {'; '.join(_titled(sg) for sg in b['suggestions']) or 'none'}."
                    f" Settings {len(b['settings'])}, questions {len(b['questions'])}.")

    def check_picks(self, arg: dict[str, Any]) -> tuple[bool, str]:
        """Scout's picks for the day (Q48): at least `min` of them on Home, each with evidence
        that resolves and one action."""
        from alpha.runtime.agents import scout

        picks = [p for p in scout.picks_of_day(self.world) if p["at"] >= self.mark.at]
        ok = len(picks) >= int(arg.get("min") or 1)
        words = "; ".join(f"{p['title']} [{p['kind']}{', less sure' if p.get('less_sure') else ''}"
                          f"{', card' if p.get('card') else ''}] → {p['action']}" for p in picks)
        return ok, f"{len(picks)} pick(s): {words or 'none'}."

    def check_ask(self, arg: dict[str, Any]) -> tuple[bool, str]:
        """A question for the person, as a card, from the last turn (Q35): `derived` whether
        the core made it from the reply, `options_min` how many choices at least."""
        if not self.last_turn:
            return False, "No turn."
        asks = [a for a in self.world.journal.open_asks()
                if a["data"].get("turn") == self.last_turn]
        if not asks:
            return False, "The last turn made no card."
        a = asks[-1]
        words = (f"\"{a['text'][:80]}\" with {a['data'].get('options') or 'no'} options"
                 f"{' (made by the core)' if a['data'].get('derived') else ' (the model\'s own)'}")
        if "derived" in arg and bool(a["data"].get("derived")) != bool(arg["derived"]):
            return False, words
        if len(a["data"].get("options") or []) < int(arg.get("options_min", 0)):
            return False, words
        return True, words

    def check_reply(self, arg: dict[str, Any]) -> tuple[bool, str]:
        text = self.last_reply
        if "contains" in arg and arg["contains"].lower() not in text.lower():
            return False, f"The reply doesn't say \"{arg['contains']}\"."
        if "matches" in arg and not re.search(arg["matches"], text, re.I):
            return False, f"The reply doesn't match /{arg['matches']}/."
        return True, "The reply reads as expected."

    def _given(self, turn_id: str, title: str, cap: int = 1_500) -> str:
        """One section of what the model was given for a turn (the pre-pack kept with it)."""
        kept = self.world.journal.context(turn_id)
        return prepack.section_of(str(kept["context"]) if kept else "", title)[:cap]

    def check_judge(self, arg: Any) -> tuple[bool, str]:
        rubric = arg if isinstance(arg, str) else arg["rubric"]
        if not self.last_turn:
            return False, "No turn to judge."
        said = self.world.journal.read(self.last_turn)
        system = ("You judge one answer against a rubric. Reply with JSON only:"
                  ' {"pass": true|false, "why": "one sentence"}. What Alpha did in the turn,'
                  " from its own journal, is the evidence of what it read: an answer drawn"
                  " from those steps is not invented.")
        earlier = ""
        if isinstance(arg, dict) and arg.get("history") and len(self.exchanges) > 1:
            shown = self.exchanges[-1 - int(arg["history"]):-1]
            earlier = "Earlier in this conversation:\n" + "\n".join(
                f'Person: "{s}"\nAlpha: {r}' for s, r in shown) + "\n\n"
        # 14 Oct 2026: gmail_network's judge saw only the answer and called four real Gmail
        # reads invented; the turn's steps are what Alpha read and did.
        steps = [s for s in self.world.journal.of_turn(self.last_turn)
                 if s["kind"] in ("saw", "did", "made", "changed", "failed", "noticed")]
        done = ("What Alpha did in this turn, from its journal:\n" + "\n".join(
            f"- {s['kind']}: {' '.join(s['text'].split())[:240]}" for s in steps) + "\n\n"
                if steps else "Alpha's journal records no step in this turn.\n\n")
        # 15 Oct 2026: memory_noticing's judge called a remembered fact (Vikas moving to
        # Bangalore, kept by Watson the turn before) invented, because memory leaves no step
        # in the turn that uses it. What the model was given about whoever the sentence names
        # is the evidence of what it remembered.
        known = self._given(self.last_turn, "WHO THE SENTENCE NAMES")
        remembered = (f"What Alpha already knew when it answered (its memory, given to it with"
                      f" the sentence):\n{known}\n\n" if known else "")
        prompt = (f'{earlier}The person said: "{said["text"]}"\n\n{done}{remembered}The answer:\n'
                  f"{self.last_reply}\n\nThe rubric: {rubric}")
        result = self.runner(claude_cli.TurnRequest(
            sentence=prompt, system=system, world_path=self.world.path,
            turn_id=self.last_turn, kind="judge"))
        if not result.ok:
            return False, f"The judge did not answer: {result.error}"
        m = re.search(r"\{.*\}", result.reply, re.S)
        try:
            verdict = json.loads(m.group(0)) if m else {}
        except json.JSONDecodeError:
            verdict = {}
        return bool(verdict.get("pass")), str(verdict.get("why") or result.reply[:300])

    def check_count(self, arg: dict[str, Any]) -> tuple[bool, str]:
        rows = self.world.collections.query(arg["collection"], limit=None)
        n = len(rows)
        if "reader" in arg:
            rows = [r for r in rows if r.get("_gone_at") is None]
            n = len(rows)
            reader = self.world.readers.get(arg["reader"])
            fraction = float(arg.get("at_least_fraction_of_last_ok", 0.95))
            floor = (reader.get("last_ok_count") or 0) * fraction
            return n >= floor, f"{n} rows kept; the reader last read {reader.get('last_ok_count')}."
        want = int(arg.get("at_least", 1))
        return n >= want, f"{n} rows (wanted at least {want})."

    def check_reader_health(self, arg: Any) -> tuple[bool, str]:
        reader = self.world.readers.get(arg if isinstance(arg, str) else arg["name"])
        return reader["health"] == "ok", (
            f"{reader['name']}: {reader['health']}, {reader.get('last_count')} rows"
            + (f"; {reader['last_problem']}" if reader.get("last_problem") else "") + ".")

    def check_run_verdict(self, arg: dict[str, Any]) -> tuple[bool, str]:
        """The last run's verdict, judged by code, is one of the allowed."""
        auto = self.last_agent or self._agent(arg["title"])
        last = self.world.runs.last(auto["id"])
        if last is None:
            return False, "No run ended."
        allowed = arg.get("one_of") or [arg.get("verdict", "succeeded")]
        words = f"{last['verdict']}: {last['why'] or last['line']}" + (
            f" (model {last['model_ms'] // 1000} s, {last['repairs']} repairs)")
        return last["verdict"] in allowed, words

    def check_agent_is_pipeline(self, arg: Any) -> tuple[bool, str]:
        """The agent runs as steps now (no model), not by its brief."""
        if self.last_agent:
            auto = self.last_agent
        elif isinstance(arg, str) or (isinstance(arg, dict) and arg.get("title")):
            auto = self._agent(arg if isinstance(arg, str) else arg["title"])
        else:
            # the newest agent the journey made, whatever Alpha named it
            made = [a for a in self.world.agents.all() if a.get("created_at", "") >= self.mark.at]
            if not made:
                return False, "No agent was made in this journey."
            auto = made[-1]
        auto = self.world.agents.get(auto["id"])
        steps = auto.get("steps") or []
        reads = [s["read"] for s in steps if "read" in s]
        return bool(steps), (f"Steps: {', '.join(reads)} then tell." if steps
                             else "Still a brief the model follows.")

    def check_agent(self, arg: dict[str, Any]) -> tuple[bool, str]:
        auto = self.last_agent or self._agent(arg["title"])
        result, problem = auto.get("last_result") or "", auto.get("last_error") or ""
        if "result_matches" in arg and not re.search(arg["result_matches"], result):
            return False, f"Result \"{result[:120]}\" doesn't match /{arg['result_matches']}/."
        if problem and not (arg.get("problem_allowed")
                            and re.search(arg["problem_allowed"], problem, re.I)):
            return False, f"Problem: {problem}"
        return True, f"{result[:160]}" + (f" Problem allowed: {problem}" if problem else "")

    def check_action(self, arg: dict[str, Any]) -> tuple[bool, str]:
        new = [a for a in self.world.actions.all() if a["created_at"] >= self.mark.at]
        if not new:
            return False, "No action was proposed."
        action = self.last_action or sorted(new, key=lambda a: a["created_at"])[-1]
        action = self.world.actions.get(action["id"])
        words = (f"\"{action['title']}\" ({action['effect']} on {action['site']}):"
                 f" {action['state']}"
                 + (f"; {action['error']}" if action.get("error") else "")
                 + (f"; preview {Path(action['preview']).name}" if action.get("preview") else ""))
        if "state" in arg and action["state"] != arg["state"]:
            return False, words
        if "effect" in arg and action["effect"] != arg["effect"]:
            return False, words
        if arg.get("preview") and not (action.get("preview") and Path(action["preview"]).exists()):
            return False, words + "; no preview screenshot"
        if "procedure" in arg and action["procedure"] != arg["procedure"]:
            return False, words + f"; through {action['procedure']}, not {arg['procedure']}"
        return True, words

    def check_document(self, arg: dict[str, Any]) -> tuple[bool, str]:
        module = self.world.modules.get(arg["module"])["id"] if arg.get("module") else None
        rows = [r for r in self.world.store.all(
            "SELECT * FROM documents WHERE removed_at IS NULL AND indexed_at >= ?"
            " ORDER BY indexed_at", (self.mark.at,))
            if (module is None or r["module"] == module)
            and (not arg.get("kind") or r["kind"] == arg["kind"])]
        if not rows:
            return False, "No such document was kept."
        return True, ", ".join(f"{r['title']} ({r['size']} bytes, {len(r['text'].split())} words)"
                               for r in rows) + "."

    def check_journal(self, arg: dict[str, Any]) -> tuple[bool, str]:
        entries = [e for e in self.world.journal.recent(200, kinds=[arg["kind"]])
                   if e["at"] >= self.mark.at
                   and (not arg.get("contains") or arg["contains"].lower() in e["text"].lower())
                   and (not arg.get("url_contains")
                        or arg["url_contains"] in str((e.get("data") or {}).get("url", "")))]
        noun = "entry" if len(entries) == 1 else "entries"
        return bool(entries), (f"{len(entries)} {arg['kind']} {noun}"
                               + (f": {entries[-1]['text'][:160]}" if entries else "") + ".")


def run_journey(world: World, journey: dict[str, Any],
                runner: turn.Runner = route.run) -> Outcome:
    out = Outcome(name=journey["name"], title=journey.get("title", journey["name"]))
    began = time.monotonic()
    run = Run(world, runner)
    try:
        for spec in journey.get("steps", []):
            out.steps.append(run.step(spec))
        for spec in journey.get("checks", []):
            out.checks.append(run.check(spec))
        for spec in journey.get("steps_after", []):
            out.steps.append(run.step(spec))
        for spec in journey.get("checks_after", []):
            out.checks.append(run.check(spec))
    except Exception as e:  # a journey that breaks is a failed journey, not a crashed suite
        out.error = f"{type(e).__name__}: {e}"
    out.seconds = round(time.monotonic() - began, 1)
    return out


# ---- the suite ----


def default_world() -> Path:
    app = APP_HOME / "world.sqlite"
    if app.exists():
        return app
    return default_world_path()


def report(outcomes: list[Outcome], *, source: Path, home: Path, began: datetime,
           fresh: bool = False) -> str:
    passed = sum(1 for o in outcomes if o.passed)
    where = (f"a fresh world in `{home}` with the sign-ins of `{source.parent}`" if fresh
             else f"a copy of `{source}` in `{home}`")
    lines = [f"# Journeys, {began.strftime('%-d %b %Y %H:%M')}", "",
             f"{passed} of {len(outcomes)} passed. World: {where}."
             f" Thinks with: {route.WORDS[route.chosen(home / 'world.sqlite')]}, model"
             f" {config.model_for('turn')}.", ""]
    lines.append("| Journey | Verdict | Time |")
    lines.append("|---|---|---|")
    for o in outcomes:
        lines.append(f"| {o.title} | {'passed' if o.passed else 'FAILED'} | {o.seconds:.0f} s |")
    for o in outcomes:
        verdict = "passed" if o.passed else "failed"
        lines += ["", f"## {o.title} — {verdict} ({o.seconds:.0f} s)", ""]
        if o.error:
            lines.append(f"Broke: {o.error}")
        for s in o.steps:
            kind = next((k for k in ("say", "reader", "agent", "break_reader", "approve_action",
                                     "agree_workflow", "add_row", "seed") if k in s), "step")
            state = "ok" if s["ok"] else "not ok"
            head = f"- **{kind}** {s.get(kind, '')!s:.80} · {s.get('seconds', 0)} s · {state}"
            detail = (s.get("reply") or s.get("result") or s.get("report") or s.get("detail")
                      or "")
            if s.get("problem"):
                detail = f"{detail} Problem: {s['problem']}"
            lines.append(head + (f"\n  {str(detail).strip()[:600]}" if detail else ""))
        for c in o.checks:
            lines.append(f"- check **{c['check']}**: {'✓' if c['ok'] else '✗'} {c['why']}"
                         f" ({c['seconds']} s)")
    return "\n".join(lines) + "\n"


def run_suite(names: list[str] | None = None, *, world_path: Path | None = None,
              scratch: Path | None = None, out_dir: Path | None = None,
              runner: turn.Runner = route.run, keep: bool = False,
              fresh: bool = False) -> tuple[int, Path]:
    """Copy the world (or start a fresh one with the app's sign-ins, `fresh`), run the
    journeys, write `docs/journeys/<stamp>.md` and `.json`. Returns (failures, report path)."""
    began = datetime.now().astimezone()
    source = world_path or default_world()
    stamp = began.strftime("%Y-%m-%d-%H%M")
    home = scratch or Path(os.environ.get("TMPDIR", "/tmp")) / "alpha-journeys" / stamp
    journeys = load(names)
    # A journey that says `fresh: true` (the first-day sentences) starts from an empty world;
    # the suite runs on a fresh world when told to or when every journey asked for one, else
    # on a copy, and a mixed set is refused rather than run half right.
    wants = {bool(j.get("fresh")) for j in journeys}
    if not fresh and wants == {True}:
        fresh = True
    if not fresh and True in wants:
        asked = ", ".join(j["name"] for j in journeys if j.get("fresh"))
        raise Problem(f"{asked} run on a fresh world (`--fresh`), the others on a copy: run"
                      " them apart.")
    copied = fresh_home(source, home) if fresh else copy_home(source, home)
    os.environ["ALPHA_HOME"] = str(home)  # the browser hand keeps its profiles under it
    os.environ["ALPHA_WORLD"] = str(copied)
    world = World(copied)
    outcomes: list[Outcome] = []
    try:
        for journey in journeys:
            outcomes.append(run_journey(world, journey, runner))
    finally:
        world.close()
    folder = out_dir or (Path(__file__).resolve().parents[3] / "docs" / "journeys")
    folder.mkdir(parents=True, exist_ok=True)
    # The raw outcomes first: a slip in the report's wording must never lose a run's results.
    (folder / f"{stamp}.json").write_text(json.dumps(
        [o.__dict__ for o in outcomes], indent=1, ensure_ascii=False, default=str))
    text = report(outcomes, source=source, home=home, began=began, fresh=fresh)
    (folder / f"{stamp}.md").write_text(text)
    failed = sum(1 for o in outcomes if not o.passed)
    if not keep and not failed:
        # A failed run keeps its copy: the world and the workspaces are what explains it.
        shutil.rmtree(home, ignore_errors=True)
    return failed, folder / f"{stamp}.md"
