"""Run the journeys in `journeys/*.yaml` against a copy of a world and write a report.

A journey file:

    name: branded_food
    title: A branded food is logged from its label, not guessed
    steps:
      - say: "i had a 45g bar of cadbury dairy milk"      # a turn, as the person
        module: Nutrition
      - reader: {name: linkedin_connections, into: linkedin_connections, key: profile_url}
      - automation: "Daily deal tracker"                   # run one automation now, by title
      - build: latest                                      # approve the newest plan, build it
      - approve_action: latest   # (in steps_after) the person's yes to the newest action
    checks:
      - independent: {}                     # the second opinion on the last turn agrees
      - row: {collection: food_log, source_not: [estimated]}   # a row this journey added
      - near: {collection: food_log, field: calories, value: 240, within: 0.1}
      - no_new_tables: {}
      - no_new_modules: {}
      - plan: proposed
      - reply: {matches: "\\n\\s*1[.)]"}     # regex on the last reply (or `contains`)
      - judge: "Did the answer name people from the connections table, or say plainly none?"
      - count: {collection: linkedin_connections, at_least_fraction_of_last_ok: 0.95,
                reader: linkedin_connections}
      - reader_health: linkedin_connections
      - automation: {title: "Daily deal tracker", result_matches: "Read \\d+ of \\d+",
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
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from alpha.runtime import automation as automation_runtime
from alpha.runtime import build, check, claude_cli, pipeline, turn
from alpha.world.store import Problem, now
from alpha.world.world import World

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
    return target


# ---- running ----


@dataclass
class Mark:
    """Where a journey began: what existed before it, to judge what it added."""
    at: str
    tables: set[str]
    modules: set[str]
    plans: set[str]


def mark(world: World) -> Mark:
    return Mark(
        at=now(),  # UTC, like every `at` and `created_at` in the world
        tables={t["name"] for t in world.collections.overview()},
        modules={m["id"] for m in world.modules.all()},
        plans={p["id"] for p in world.plans.all()},
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
    def __init__(self, world: World, runner: turn.Runner = claude_cli.run) -> None:
        self.world = world
        self.runner = runner
        self.last_turn: str | None = None
        self.last_reply: str = ""
        self.last_automation: dict[str, Any] | None = None
        self.last_action: dict[str, Any] | None = None
        self.mark = mark(world)

    # steps

    def step(self, spec: dict[str, Any]) -> dict[str, Any]:
        began = time.monotonic()
        if "say" in spec:
            outcome = turn.ask(self.world, spec["say"], module=spec.get("module"),
                               runner=self.runner)
            self.last_turn, self.last_reply = outcome.said, outcome.reply
            if outcome.ok:
                self._settle_builds()
            record = {"say": spec["say"], "ok": outcome.ok, "reply": outcome.reply[:600],
                      "steps": outcome.result.num_turns}
        elif "reader" in spec:
            r = spec["reader"]
            out = pipeline.run_reader(self.world, r["name"], r["into"], r["key"],
                                      keep=r.get("keep"))
            record = {"reader": r["name"], "ok": out.get("health") == "ok",
                      "health": out.get("health"), "detail": out.get("problem") or out.get("line")}
        elif "automation" in spec:
            auto = self._automation(spec["automation"])
            self.last_automation = automation_runtime.run(self.world, auto["id"],
                                                          runner=self.runner)
            record = {"automation": auto["title"], "ok": not self.last_automation.get("last_error"),
                      "result": self.last_automation.get("last_result"),
                      "problem": self.last_automation.get("last_error")}
        elif "approve_action" in spec:
            from alpha.runtime import acting

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
        elif "build" in spec:
            plan = self._latest_plan()
            self.world.plans.approve(plan["id"], "Approved by the journey suite")
            final = self._settle_builds()
            record = {"build": plan["title"], "ok": final.get("state") == "done",
                      "state": final.get("state"), "report": (final.get("report") or "")[:600]}
        else:
            raise Problem(f"Unknown step: {spec}")
        record["seconds"] = round(time.monotonic() - began, 1)
        return record

    def _settle_builds(self) -> dict[str, Any]:
        """Run every approved or building plan to its end, as the scheduler would."""
        last: dict[str, Any] = {}
        for _ in range(50):
            # Only plans this journey proposed: a build copied from the live world is not ours
            # to continue (it would spend the subscription twice).
            pending = [p for p in self.world.plans.all(("approved", "building"))
                       if p["id"] not in self.mark.plans]
            if not pending:
                break
            for plan in pending:
                last = build.run_build(self.world, plan["id"], runner=self.runner)
        return last

    def _automation(self, title: str) -> dict[str, Any]:
        hits = [a for a in self.world.automations.all() if title.lower() in a["title"].lower()]
        if len(hits) != 1:
            raise Problem(f"{len(hits)} automations match '{title}'.")
        return hits[0]

    def _latest_plan(self) -> dict[str, Any]:
        new = [p for p in self.world.plans.all(("proposed",)) if p["id"] not in self.mark.plans]
        if not new:
            raise Problem("No plan was proposed in this journey to build.")
        return sorted(new, key=lambda p: p["created_at"])[-1]

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
        result = check.check(self.world, self.last_turn, runner=self.runner, repair=False)
        if not result["checked"]:
            return False, result["why"]
        return bool(result["agree"]) and not result["unstated"], check.words(result)

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

    def check_no_new_tables(self, arg: dict[str, Any]) -> tuple[bool, str]:
        new = {t["name"] for t in self.world.collections.overview()} - self.mark.tables
        return not new, ("No table was made." if not new else f"Made tables: {sorted(new)}.")

    def check_no_new_modules(self, arg: dict[str, Any]) -> tuple[bool, str]:
        new = {m["id"] for m in self.world.modules.all()} - self.mark.modules
        return not new, ("No module was made." if not new else f"Made {len(new)} module(s).")

    def check_plan(self, arg: Any) -> tuple[bool, str]:
        state = arg if isinstance(arg, str) else arg.get("state", "proposed")
        new = [p for p in self.world.plans.all() if p["id"] not in self.mark.plans]
        hits = [p for p in new if p["state"] == state]
        if not new:
            return False, "No plan was proposed."
        return bool(hits), f"Plans: {', '.join(p['title'] + ' (' + p['state'] + ')' for p in new)}."

    def check_reply(self, arg: dict[str, Any]) -> tuple[bool, str]:
        text = self.last_reply
        if "contains" in arg and arg["contains"].lower() not in text.lower():
            return False, f"The reply doesn't say \"{arg['contains']}\"."
        if "matches" in arg and not re.search(arg["matches"], text, re.I):
            return False, f"The reply doesn't match /{arg['matches']}/."
        return True, "The reply reads as expected."

    def check_judge(self, arg: Any) -> tuple[bool, str]:
        rubric = arg if isinstance(arg, str) else arg["rubric"]
        if not self.last_turn:
            return False, "No turn to judge."
        said = self.world.journal.read(self.last_turn)
        system = ("You judge one answer against a rubric. Reply with JSON only:"
                  ' {"pass": true|false, "why": "one sentence"}.')
        prompt = (f'The person said: "{said["text"]}"\n\nThe answer:\n{self.last_reply}\n\n'
                  f"The rubric: {rubric}")
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

    def check_automation(self, arg: dict[str, Any]) -> tuple[bool, str]:
        auto = self.last_automation or self._automation(arg["title"])
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
                runner: turn.Runner = claude_cli.run) -> Outcome:
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
    from alpha.world.world import default_world_path

    return default_world_path()


def report(outcomes: list[Outcome], *, source: Path, home: Path, began: datetime) -> str:
    passed = sum(1 for o in outcomes if o.passed)
    lines = [f"# Journeys, {began.strftime('%-d %b %Y %H:%M')}", "",
             f"{passed} of {len(outcomes)} passed. World: a copy of `{source}` in `{home}`."
             f" Model: {os.environ.get('ALPHA_MODEL', claude_cli.DEFAULT_MODEL)}.", ""]
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
            kind = next(k for k in ("say", "reader", "automation", "build", "approve_action")
                        if k in s)
            state = "ok" if s["ok"] else "not ok"
            head = f"- **{kind}** {s[kind]!s:.80} · {s['seconds']} s · {state}"
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
              runner: turn.Runner = claude_cli.run, keep: bool = False) -> tuple[int, Path]:
    """Copy the world, run the journeys, write `docs/journeys/<stamp>.md` and `.json`.
    Returns (failures, report path)."""
    began = datetime.now().astimezone()
    source = world_path or default_world()
    stamp = began.strftime("%Y-%m-%d-%H%M")
    home = scratch or Path(os.environ.get("TMPDIR", "/tmp")) / "alpha-journeys" / stamp
    copied = copy_home(source, home)
    os.environ["ALPHA_HOME"] = str(home)  # the browser hand keeps its profiles under it
    os.environ["ALPHA_WORLD"] = str(copied)
    world = World(copied)
    outcomes: list[Outcome] = []
    try:
        for journey in load(names):
            outcomes.append(run_journey(world, journey, runner))
    finally:
        world.close()
    folder = out_dir or (Path(__file__).resolve().parents[3] / "docs" / "journeys")
    folder.mkdir(parents=True, exist_ok=True)
    text = report(outcomes, source=source, home=home, began=began)
    (folder / f"{stamp}.md").write_text(text)
    (folder / f"{stamp}.json").write_text(json.dumps(
        [o.__dict__ for o in outcomes], indent=1, ensure_ascii=False, default=str))
    if not keep:
        shutil.rmtree(home, ignore_errors=True)
    return sum(1 for o in outcomes if not o.passed), folder / f"{stamp}.md"
