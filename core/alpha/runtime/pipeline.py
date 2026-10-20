"""Running readers, and agents that are pipelines of saved steps.

A reader run is the same wherever it starts (a turn's `reader_run`, a pipeline step): run the
saved script through the browser, check its health against what this reader found before,
apply the step's saved value mappings, save the rows (each marked seen; the reader's rows it no
longer returns marked gone), and keep the source's status.

A pipeline is a list of steps the scheduler runs with no model:

    {"read": reader, "into": table, "key": field, "keep": [fields], "map": {field: {from: to}}}
    {"tell": table, "where": {...}}
    {"run": skill}   (another run skill's steps, in place: composition, design §3.7 point 7)

The model is called only when a read step breaks: Doc repairs it (runtime/agents/doc.py)
(fix the reader), then the step runs once more. A sign-in wall asks the person once; a bot check
marks the source blocked. Nothing fails silently: every source's status says what happened.
"""

from __future__ import annotations

import re
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any

from alpha.config import settings
from alpha.connectors.browser import BOT_CHECK, SIGN_IN, Browser
from alpha.connectors.robots import DISALLOWED, UNREACHABLE, Robots
from alpha.runtime import route, turn, value_sources
from alpha.runtime.agents import doc
from alpha.world import people
from alpha.world.readers import MISSING, health_problem, key_problem
from alpha.world.sites import site_of
from alpha.world.sources import TERMS_BLOCK
from alpha.world.store import Problem
from alpha.world.world import World

NEWEST_ONLY = "Reads the newest page only, so listings that drop off it aren't counted as gone."
DETAIL_PAUSE_S = settings.readers.detail_pause_s

def apply_map(rows: Any, mapping: dict[str, dict[str, Any]] | None) -> Any:
    """A step's saved value mappings ("PENDING" → "Pending", "For Sale" → "Active"), matched
    regardless of case and spacing."""
    if not mapping or not isinstance(rows, list):
        return rows
    squash = {f: {" ".join(str(k).split()).casefold(): v for k, v in m.items()}
              for f, m in mapping.items()}
    out = []
    for row in rows:
        if isinstance(row, dict):
            row = dict(row)
            for field, table in squash.items():
                value = row.get(field)
                if value is not None:
                    key = " ".join(str(value).split()).casefold()
                    if key in table:
                        row[field] = table[key]
        out.append(row)
    return out


def _source(world: World, reader: dict[str, Any], module: str | None) -> dict[str, Any]:
    """The source this reader reads, made when it doesn't exist yet."""
    for source in world.sources.of_reader(reader["name"]):
        return source
    return world.sources.add(reader["description"], reader["url"], module=module,
                             reader=reader["name"])


def run_reader(world: World, name: str, collection: str, key: str, *,
               keep: list[str] | None = None, mapping: dict[str, dict[str, Any]] | None = None,
               turn_id: str | None = None, module: str | None = None,
               browser: Browser | None = None, thread: str | None = None,
               agent: str | None = None) -> dict[str, Any]:
    """`thread`: a pipeline's run, so what the reader did shows on the agent's page; `agent`:
    whose run it is, kept on the rows so its own writes never wake it (P7)."""
    reader = world.readers.get(name)
    desc = world.collections.describe(collection)
    home = desc["module"] or module
    source = _source(world, reader, home)
    # What the site says about automated reading comes first (P14): its terms, read by Alpha
    # when the source was added, and its robots rules, read by code when a day old.
    site = site_of(reader["url"])
    if source.get("terms") == "not_allowed":
        world.sources.ran(name, status="blocked", detail=TERMS_BLOCK.format(
            quote=source.get("terms_quote"), url=source.get("terms_url")))
        return {"health": "blocked", "site": site,
                "note": "The site's terms don't allow automated reading; nothing was read."}
    state, words = Robots(world).check(reader["url"])
    world.sources.robots(source["id"], state, words)
    if state == DISALLOWED:
        world.readers.ran(name, count=0, problem=None)
        world.sources.ran(name, status="blocked", detail=words)
        return {"health": "blocked", "site": site, "note": words + " Nothing was read."}
    if state == UNREACHABLE:
        return {"health": "unreachable", "site": site, "note": words}
    browser = browser or Browser(world)
    out = browser.script(
        reader["url"], reader["script"], to_end=reader["to_end"], turn=turn_id, module=home,
        label=f"the reader {name}", thread=thread)
    if out.get("bot_check"):
        world.readers.ran(name, count=0, problem="a bot check stopped it")
        world.sources.ran(name, status="blocked", detail=BOT_CHECK)
        return {"health": "blocked", "site": site_of(reader["url"]),
                "note": "The site stops automated reading; nothing was written. Say so."}
    if out.get("needs_signin"):
        world.readers.ran(name, count=0, problem="the site asked for a sign-in")
        world.sources.ran(name, status="needs_signin", detail=SIGN_IN)
        return {"health": "needs_signin", "site": site_of(reader["url"]),
                "note": "Offer browser_signin; nothing was written."}
    rows = apply_map(out["result"], mapping)
    required = [f["name"] for f in desc["fields"] if f.get("required")]
    problem = health_problem(rows, last_ok=reader["last_ok_count"],
                             required=sorted(set(required + [key])),
                             held=world.collections.held_by(collection, name))
    count = len(rows) if isinstance(rows, list) else 0
    known = world.collections.keyed(collection, key)
    if not problem:
        problem = key_problem(rows, key, title=desc.get("title_field"), whole=reader["whole"],
                              held={k: r["values"].get(desc.get("title_field") or "")
                                    for k, r in known.items()
                                    if r["reader"] == name and not r["gone"]})
    detail: dict[str, Any] = {}
    if not problem and reader.get("detail") and reader.get("page"):
        detail = _details(world, reader, rows, known, key, desc, browser, turn_id, home,
                          thread)
        problem = detail.get("problem")
    if problem:
        world.readers.ran(name, count=count, problem=problem)
        world.sources.ran(name, status="broken", detail=f"Its reader looks broken: {problem}.")
        world.journal.append(
            "failed", f"The reader {name} looks broken: {problem}. Nothing was written.",
            data={"reader": name, "turn": turn_id}, module=home, thread=thread)
        return {"health": "broken", "problem": problem, "rows": count,
                "sample": rows[:5] if isinstance(rows, list) else rows,
                "note": ("Don't run this reader again unchanged: the same page gives the same"
                         " rows. Look at the page as it is now (page_script returning the HTML"
                         " of one item, or page_read), compare it with what the script expects,"
                         " fix the script, reader_save it under the same name, then reader_run"
                         " once. Fewer rows than before can also mean the page had not finished"
                         " loading (the Mac dozing, a slow network): a script that still finds"
                         " its items on the current HTML needs no rewrite, only that one rerun.")}
    rows, sources = _sourced(world, reader, rows, detail.get("read") or {}, desc)
    result = world.collections.upsert(
        collection, key, rows, {"by": "alpha", "turn": turn_id, "reader": name,
                                **({"agent": agent} if agent else {})},
        fill_only=set(keep or []), seen_by=name, mark_gone=reader["whole"], sources=sources,
    )
    world.readers.ran(name, count=count, problem=None)
    if desc.get("identity"):
        people.settle_if_changed(world)  # who may be the same, proposed (P8)
    world.sources.ran(name, status="working", rows=count,
                      detail=detail.get("note") or (None if reader["whole"] else NEWEST_ONLY))
    world.journal.append(
        "did",
        f"Read {count} with {name} into {desc['title']}: {result['added']} new,"
        f" {result['updated']} updated, {result['unchanged']} unchanged"
        + (f", {result['gone']} gone" if result.get("gone") else "")
        + (f", {result['invalid']} set aside" if result["invalid"] else "") + "."
        + (f" {detail['line']}" if detail.get("line") else ""),
        data={"collection": collection, "reader": name, "turn": turn_id,
              **{k: v for k, v in result.items() if k != "ids"},
              "records": list(result.get("ids") or [])[:500]},
        module=home, thread=thread,
    )
    return {"health": "ok", "rows": count, **{k: v for k, v in result.items() if k != "ids"}}


def _changed(world: World, table: str, row: dict[str, Any], record: dict[str, Any] | None,
             page: str) -> bool:
    """A row whose own page is to be read: new, changed on the list since the last run (as
    the table keeps it: "850,000" is 850000), or never read on its page (no value of it
    sourced to that page)."""
    if record is None:
        return True
    values = record["values"]
    clean = world.collections.cleaned(table, row)
    if clean is None or any(values.get(f) != v for f, v in clean.items()
                            if v not in (None, "")):
        return True
    address = row.get(page)
    fields = (record["provenance"] or {}).get("fields") or {}
    return not any(isinstance(e, dict) and e.get("url") == address for e in fields.values())


def _details(world: World, reader: dict[str, Any], rows: list[dict[str, Any]],
             known: dict[str, dict[str, Any]], key: str, desc: dict[str, Any],
             browser: Browser, turn_id: str | None, module: str | None,
             thread: str | None) -> dict[str, Any]:
    """The detail step (P14): the reader's second script run on the own page of each row that
    is new or changed, one page after another in one browser. Returns what each page gave
    (`read`, by address), the run's line and the source's note, or `problem` when the detail
    script looks broken (then nothing of the run is written, as for a broken list)."""
    page = str(reader["page"])
    fields = {f["name"] for f in desc["fields"]}
    wanted = [r for r in rows if isinstance(r.get(page), str)
              and r[page].startswith(("http://", "https://"))
              and _changed(world, desc["name"], r, known.get(str(r.get(key))), page)]
    robots = Robots(world)
    urls, refused = [], 0
    for row in wanted:
        state, _ = robots.check(row[page])
        if state == "allowed":
            urls.append(row[page])
        else:
            refused += 1
    if not urls:
        return {"read": {}, "line": f"{refused} listing pages left unread: the site's robots"
                " rules." if refused else None}
    out = browser.pages(urls, str(reader["detail"]), pause_s=DETAIL_PAUSE_S, turn=turn_id,
                        module=module, label=f"the reader {reader['name']}'s detail script",
                        thread=thread)
    got: dict[str, dict[str, Any]] = {}
    empty, opened, unknown = 0, 0, set()
    for item in out["pages"]:
        if "error" in item:
            continue
        opened += 1
        value = item.get("result")
        if not isinstance(value, dict) or not any(v not in (None, "", []) for v in value.values()):
            empty += 1
            continue
        unknown |= {k for k in value if k not in fields}
        got[item["url"]] = {k: v for k, v in value.items() if k in fields and v not in (None, "")}
    if opened and empty > opened * MISSING:
        return {"problem": f"its detail script returned nothing on {empty} of {opened} listing"
                f" pages (the script for one item's own page, beside the list's)"}
    stopped = {"bot_check": "a page stopped Alpha with a bot check",
               "sign_in": "a page asked for a sign-in"}.get(str(out.get("stopped")))
    line = f"Opened {len(got)} of {len(wanted)} new or changed listing pages."
    if stopped:
        line += f" Stopped: {stopped}; the rest keep what the list gave."
    if refused:
        line += f" {refused} left unread: the site's robots rules."
    if unknown:
        line += f" Its detail script gave fields the table hasn't: {', '.join(sorted(unknown))}."
    return {"read": got, "line": line, "note": f"Listing pages: {stopped}." if stopped else None}


def _sourced(world: World, reader: dict[str, Any], rows: list[dict[str, Any]],
             read: dict[str, dict[str, Any]], desc: dict[str, Any]
             ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Each row with what its own page gave, and each value's source by code (P14, in P5's
    shape): the page it was read from, the list or the item's own, with the time it was read."""
    fields = {f["name"] for f in desc["fields"]}
    listed = value_sources.normalise(world, {"url": reader["url"]})
    out_rows, out_sources = [], []
    for row in rows:
        own_page = row.get(str(reader.get("page") or ""))
        found = read.get(own_page) if isinstance(own_page, str) else None
        merged = {**row, **(found or {})}
        sources = {f: listed for f, v in row.items() if f in fields and v not in (None, "")}
        if found:
            mine = value_sources.normalise(world, {"url": own_page})
            sources.update({f: mine for f in found})
        out_rows.append(merged)
        out_sources.append(sources)
    return out_rows, out_sources


def check_steps(world: World, steps: list[dict[str, Any]],
                *, within: str | None = None) -> list[dict[str, Any]]:
    """Steps as the scheduler will run them, or a Problem saying what's wrong. `within` is the
    run skill being written, so it cannot call itself."""
    if not isinstance(steps, list) or not steps:
        raise Problem("A pipeline needs at least one step.")
    clean: list[dict[str, Any]] = []
    for step in steps:
        if "run" in step:
            name = step["run"]
            called = world.skills.get(name, "run")
            if name == within or any("run" in s and s["run"] == within
                                     for s in called["steps"]):
                raise Problem(f"The run step {name} would call itself.")
            clean.append({"run": name})
        elif "read" in step:
            world.readers.get(step["read"])
            table = step.get("into")
            if not table:
                raise Problem(f"The read step for {step['read']} needs 'into': the table.")
            fields = {f["name"] for f in world.collections.describe(table)["fields"]}
            key = step.get("key")
            if key not in fields:
                raise Problem(f"The read step for {step['read']} needs 'key': a field of {table}.")
            keep = [f for f in step.get("keep") or [] if f in fields]
            mapping = step.get("map") or {}
            if not isinstance(mapping, dict) or any(f not in fields or not isinstance(m, dict)
                                                    for f, m in mapping.items()):
                raise Problem("'map' is {field: {value as the site says it: value to keep}}.")
            clean.append({"read": step["read"], "into": table, "key": key, "keep": keep,
                          "map": mapping})
        elif "tell" in step:
            table = step["tell"]
            world.collections.query(table, step.get("where"), limit=1)
            clean.append({"tell": table, "where": step.get("where") or None})
        else:
            raise Problem("A step is {\"read\": …}, {\"tell\": …} or {\"run\": skill}.")
    return clean


def describe_changes(world: World, table: str, changes: dict[str, list[dict[str, Any]]]
                     ) -> str | None:
    desc = world.collections.describe(table)
    title_field = desc["title_field"]
    counts = {k: len(v) for k, v in changes.items()}
    if not any(counts.values()):
        return None

    def names(rows: list[dict[str, Any]]) -> str:
        shown = [str(r.get(title_field) or r["id"]) for r in rows[:5]]
        more = f" and {len(rows) - 5} more" if len(rows) > 5 else ""
        return ", ".join(shown) + more

    head = ", ".join(f"{n} {k}" for k, n in counts.items() if n)
    parts = [f"{k.capitalize()}: {names(v)}" for k, v in changes.items() if v]
    return f"{desc['title']}: {head}. " + "; ".join(parts) + "."


def _ask_once(world: World, text: str, reader: str, module: str | None) -> None:
    if any(a["data"].get("reader") == reader for a in world.journal.open_asks()):
        return
    world.journal.append("asked", text, data={"reader": reader}, module=module)


# A page that doesn't answer in the moment the Mac wakes (Wi-Fi reconnecting) is not a broken
# reader: the step is tried once more after a minute (found 7 Oct: one such failure lost a day).
TRANSIENT = re.compile(r"net::ERR_|Timeout \d+ms exceeded|ERR_NETWORK|ERR_INTERNET"
                       r"|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT", re.I)
RETRY_AFTER_S = settings.runs.retry_after_s


def transient(problem: str) -> bool:
    return TRANSIENT.search(problem) is not None


def _short(problem: str) -> str:
    words = problem.split("page.goto: ", 1)[-1].split("\n", 1)[0]
    return " ".join(words.split())[:90]


# A broken reader is repaired at most this many times in one run, then the run says it
# couldn't be (a judgement of failure, not a cap on work: the next run tries afresh).
REPAIRS_PER_RUN = settings.runs.repairs_per_run


@dataclass
class PipelineResult:
    """What a run did, for its line, its problem and its verdict. Unpacks to (line, problem)
    for the callers that only want those."""

    line: str
    problem: str | None
    read: int = 0
    sources: int = 0
    repairs: int = 0
    model_ms: int = 0
    unreachable: list[str] = field(default_factory=list)
    broken: list[str] = field(default_factory=list)
    needs: list[str] = field(default_factory=list)
    blocked: list[str] = field(default_factory=list)

    def __iter__(self) -> Iterator[Any]:
        yield self.line
        yield self.problem

    def verdict(self) -> tuple[str, str | None]:
        """Judged by code: everything read and nothing wrong is succeeded; something read with
        something wrong is partial; nothing read of what there was to read is failed."""
        if self.sources and self.read == 0:
            return "failed", self.problem or "nothing was read"
        if self.problem:
            return "partial", self.problem
        return "succeeded", None


def run_pipeline(world: World, auto: dict[str, Any], *,
                 runner: turn.Runner = route.run,
                 browser: Browser | None = None,
                 repair: Callable[..., Any] | None = None,
                 pause: Callable[[float], None] = time.sleep,
                 run_id: str | None = None) -> PipelineResult:
    """Run an agent's steps. Returns what it did, with its line and its problem."""
    # What changed is measured from the last run. A first run sets the baseline: rows made
    # while the module was built are not "new" to the person who watched it built.
    since = auto["last_run_at"]
    thread = auto["thread"]
    world.journal.append("did", f"Run {auto['name']} ({auto['when']}).", actor=auto["id"],
                         thread=thread, module=auto["module"],
                         data={"agent": auto["id"], "opens": True})
    read, needs, blocked, broken, told = 0, [], [], [], []
    unreachable: list[str] = []
    repairs, model_ms = 0, 0
    first_run = False
    for step in _flatten(world, auto["steps"]):
        if "read" in step:
            name = step["read"]
            args = {"keep": step.get("keep"), "mapping": step.get("map"),
                    "module": auto["module"], "browser": browser, "thread": thread,
                    "agent": auto["id"]}
            try:
                out = run_reader(world, name, step["into"], step["key"], **args)
            except Problem as e:
                if not transient(str(e)):
                    raise
                world.journal.append(
                    "did", f"{name} couldn't reach its page ({_short(str(e))}); trying again"
                    " in a minute.", thread=thread, module=auto["module"],
                    data={"agent": auto["id"], "reader": name})
                pause(RETRY_AFTER_S)
                try:
                    out = run_reader(world, name, step["into"], step["key"], **args)
                except Problem as again:
                    if not transient(str(again)):
                        raise
                    world.journal.append(
                        "failed", f"{name} couldn't reach its page twice"
                        f" ({_short(str(again))}); skipped this run.", thread=thread,
                        module=auto["module"], data={"agent": auto["id"], "reader": name})
                    unreachable.append(name)
                    continue
            tries = 0
            while out["health"] == "broken" and tries < REPAIRS_PER_RUN:
                tries += 1
                # Doc repairs the reader (Q49) and the run waits; the rerun says how it went.
                if repair is not None:
                    repair(world, auto, name, out["problem"], runner)
                    fix = None
                else:
                    fix = doc.repair_reader(world, auto, name, out["problem"], runner,
                                            run_id=run_id, attempt=tries)
                    model_ms += fix.model_ms
                repairs += 1
                out = run_reader(world, name, step["into"], step["key"], **args)
                if fix is not None:
                    doc.settle(world, fix, ok=out["health"] == "ok", why=out.get("problem"),
                               caller=auto)
            if out["health"] == "ok":
                read += 1
                if tries == 0:
                    doc.mark_held(world, name)  # a repair from an earlier run proved itself
            elif out["health"] == "needs_signin":
                needs.append(out["site"])
                _ask_once(world, f"Sign in to {out['site']} again so {auto['name']} can"
                          " read it.", name, auto["module"])
            elif out["health"] == "blocked":
                blocked.append(out["site"])
            elif out["health"] == "unreachable":
                unreachable.append(name)  # its robots rules couldn't be read: next run
            else:
                broken.append(name)
        elif since is None:
            first_run = True
        else:
            message = describe_changes(world, step["tell"],
                                       world.collections.changes(step["tell"], since,
                                                                 step.get("where")))
            if message:
                told.append(message)
                world.journal.append("noticed", message, actor=auto["id"],
                                     data={"agent": auto["id"]}, module=auto["module"])
    reads = sum(1 for s in _flatten(world, auto["steps"]) if "read" in s)
    line = f"Read {read} of {reads} sources." if reads else "Done."
    if told:
        line += " " + " ".join(told)
    if first_run:
        line += " First run: what is new, changed or gone is reported from the next run."
    problems = []
    if needs:
        problems.append(f"{', '.join(needs)} need{'s' if len(needs) == 1 else ''} your sign-in")
    if blocked:
        problems.append(f"{', '.join(blocked)} stop{'s' if len(blocked) == 1 else ''} automated"
                        " reading")
    if broken:
        problems.append(f"{', '.join(broken)} couldn't be repaired")
    if unreachable:
        problems.append(f"{', '.join(unreachable)} couldn't be reached")
    return PipelineResult(line=line, problem=("; ".join(problems) + ".") if problems else None,
                          read=read, sources=reads, repairs=repairs, model_ms=model_ms,
                          unreachable=unreachable, broken=broken, needs=needs, blocked=blocked)


def _flatten(world: World, steps: list[dict[str, Any]], depth: int = 0) -> list[dict[str, Any]]:
    """Steps with every `run` step replaced by the called skill's own steps (at most three
    deep; a skill cannot call itself, checked when it is saved)."""
    out: list[dict[str, Any]] = []
    for step in steps:
        if "run" in step:
            if depth >= 3:
                raise Problem(f"The run step {step['run']} is nested too deep.")
            out.extend(_flatten(world, world.skills.get(step["run"], "run")["steps"], depth + 1))
        else:
            out.append(step)
    return out


