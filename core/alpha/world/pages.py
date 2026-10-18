"""Pages the model draws (harness design §5, Q62; slice 7, 18 October 2026).

Kenil, 18 Oct: "by default we give current structure, but we should not restrict these custom
ui elements". A page is a file the model writes, `modules/<id>/pages/<name>.html`: its own
HTML, CSS and script, drawing whatever the person asked. A header at the top says its title,
whether it is the module's front, and the data it needs:

    <!--alpha
    title: Summary
    front: true
    data:
      days: SELECT date(eaten_at) AS day, SUM(calories) AS calories FROM rows_food_log
            GROUP BY day ORDER BY day
    -->

Each entry under `data` is one SELECT on the read-only views `world_query` reads (`queries.py`:
a write is refused by SQLite, not by a check of ours); the page gets the rows as
`alpha.data.<name>`. The core serves the page with its rows and Alpha's runtime in it, under a
content policy that allows the page's own script and nothing from the network; the window
shows it in a sandboxed frame and hands it the app's colours and fonts as the same CSS
variables. A page cannot write, cannot reach the network and cannot reach the app. The files
are the truth (no table): the directory lists them, `module.yaml` names them, a kit carries
them, and removing the module removes them with its directory.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml

from alpha.config import settings
from alpha.world import queries
from alpha.world.store import Problem

if TYPE_CHECKING:
    from alpha.world.world import World

HEADER = re.compile(r"\A\s*<!--alpha\n(.*?)\n-->", re.S)
NAME = re.compile(r"^[a-z][a-z0-9_]*$")
# What a page's header may say; anything else is left to the page.
HEAD_KEYS = ("title", "front", "data")
# The module's own page (its "summary page"): what the module opens on, the blocks the model
# adds when asked for a chart or a number there; a page of another name is a tab of its own.
OVERVIEW = "overview"

# What every served page gets before its own text: the rows, the theme's variables as the
# window hands them (a message, since the frame has no reach into the app), and a page's own
# error carried out to the window so it shows "This page did not draw" instead of a blank.
KIT_DIR = Path(__file__).parent / "pagekit"
RUNTIME = """<script>
(function () {
  var alpha = { data: __DATA__, theme: null, on: function (name, fn) {
    (alpha._on[name] = alpha._on[name] || []).push(fn); } , _on: {}, _report: null };
  function fire(name, value) { (alpha._on[name] || []).forEach(function (fn) {
    try { fn(value); } catch (e) { report(e); } }); }
  function report(e) {
    try { parent.postMessage({ alpha: "error", text: String(e && e.message || e) }, "*"); }
    catch (_) {}
  }
  window.addEventListener("message", function (ev) {
    var m = ev.data || {};
    if (m.alpha === "theme" && m.vars) {
      alpha.theme = m.theme || null;
      var root = document.documentElement;
      Object.keys(m.vars).forEach(function (k) { root.style.setProperty(k, m.vars[k]); });
      if (m.theme) root.setAttribute("data-theme", m.theme);
      fire("theme", alpha.theme);
    } else if (m.alpha === "data" && m.data) {
      alpha.data = m.data;
      fire("data", alpha.data);
    }
  });
  window.addEventListener("error", function (ev) { report(ev.error || ev.message); });
  window.addEventListener("unhandledrejection", function (ev) { report(ev.reason); });
  function size() {
    var h = document.documentElement.scrollHeight;
    try { parent.postMessage({ alpha: "size", height: h }, "*"); } catch (_) {}
  }
  window.addEventListener("load", function () {
    try { parent.postMessage({ alpha: "ready" }, "*"); } catch (_) {}
    size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(document.documentElement);
  });
  alpha._report = report;
  window.alpha = alpha;
})();
</script>
<style>
html, body { margin: 0; padding: 0; background: var(--bg, transparent);
  color: var(--text, inherit); font-size: var(--text-base, 14px);
  font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, sans-serif); }
body { padding: 0 1px; }
__KIT_CSS__
</style>
<script>
__KIT_JS__
</script>
"""


def runtime(rows: dict[str, Any]) -> str:
    """Alpha's runtime for one page: the rows, the messages, and the kit (`pagekit/`)."""
    return (RUNTIME.replace("__DATA__", json.dumps(rows).replace("</", "<\\/"))
            .replace("__KIT_CSS__", (KIT_DIR / "kit.css").read_text())
            .replace("__KIT_JS__", (KIT_DIR / "kit.js").read_text().replace("</", "<\\/")))

# The content policy the core serves a page under: its own inline script and style, images it
# carries itself, and nothing from anywhere (no network, no frames, no forms away).
POLICY = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';"
          " img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none';"
          " form-action 'none'; base-uri 'none'")


def split_header(text: str) -> tuple[dict[str, Any], str]:
    """The page's header and the rest of the file; a page without a header has no title and
    no data (it still draws)."""
    m = HEADER.match(text)
    if not m:
        return {}, text
    try:
        head = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as e:
        raise Problem(f"The page's header is not valid YAML: {e}") from e
    if not isinstance(head, dict):
        raise Problem("The page's header must be a mapping (title, front, data).")
    rest = text[m.end():]
    return head, rest[1:] if rest.startswith("\n") else rest


def check_header(head: dict[str, Any]) -> dict[str, Any]:
    """A header's title, front and data, each in its shape; a wrong one is a Problem in
    words, never a page that silently draws nothing."""
    unknown = sorted(set(head) - set(HEAD_KEYS))
    if unknown:
        raise Problem(f"The page's header has keys it cannot use: {', '.join(unknown)}."
                      f" It takes {', '.join(HEAD_KEYS)}.")
    data = head.get("data") or {}
    if not isinstance(data, dict):
        raise Problem("The page's data must be a mapping of name: SELECT.")
    clean: dict[str, str] = {}
    for name, sql in data.items():
        if not NAME.match(str(name)):
            raise Problem(f"The data name '{name}' must be snake_case (letters, digits, _).")
        if not isinstance(sql, str) or not queries.READS.match(sql):
            raise Problem(f"The data '{name}' must be one SELECT (or WITH … SELECT).")
        clean[str(name)] = " ".join(sql.split())
    return {"title": str(head.get("title") or "").strip() or None,
            "front": bool(head.get("front", False)), "data": clean}


def header_text(title: str, data: dict[str, str], *, front: bool = False) -> str:
    head: dict[str, Any] = {"title": title}
    if front:
        head["front"] = True
    if data:
        head["data"] = dict(data)
    return "<!--alpha\n" + yaml.safe_dump(head, sort_keys=False, allow_unicode=True,
                                          width=1000).rstrip("\n") + "\n-->\n"


class Pages:
    def __init__(self, world: World) -> None:
        self.world = world

    def dir_of(self, module_id: str) -> Path:
        return self.world.files.dir_of(module_id) / "pages"

    def path_of(self, module_id: str, name: str) -> Path:
        if not NAME.match(name):
            raise Problem(f"A page's name is snake_case ({name!r} is not).")
        return self.dir_of(module_id) / f"{name}.html"

    # ---- what a module has ----

    def names(self, module_id: str) -> list[str]:
        folder = self.dir_of(module_id)
        if not folder.is_dir():
            return []
        return sorted(p.stem for p in folder.glob("*.html") if NAME.match(p.stem))

    def all(self, module_ref: str) -> list[dict[str, Any]]:
        """Each page of the module: name, title, whether it is the front, its data names,
        and the header's problem when it has one (the window shows it; the page still lists)."""
        m = self.world.modules.get(module_ref)
        out = []
        for name in self.names(m["id"]):
            path = self.path_of(m["id"], name)
            entry: dict[str, Any] = {"name": name, "module": m["id"], "title": name,
                                     "front": False, "data": [], "problem": None,
                                     "updated_at": _stamp(path)}
            try:
                head, _ = split_header(path.read_text())
                checked = check_header(head)
                entry.update({"title": checked["title"] or name, "front": checked["front"],
                              "data": sorted(checked["data"])})
            except Problem as e:
                entry["problem"] = str(e)
            out.append(entry)
        return out

    def front(self, module_ref: str) -> dict[str, Any] | None:
        fronts = [p for p in self.all(module_ref) if p["front"] and not p["problem"]]
        return fronts[0] if fronts else None

    # ---- making one ----

    def keep(self, module_ref: str, name: str, title: str, html: str,
             data: dict[str, str] | None = None, *, front: bool = False,
             source: str | None = None) -> dict[str, Any]:
        """Write a page from its parts: the header is built here, every query run once (a
        wrong SELECT fails now, in words), the file written. `html` is the page's own text
        (markup, style, script; a whole document or a fragment, both draw)."""
        m = self.world.modules.get(module_ref)
        path = self.path_of(m["id"], name)
        front = front or name == OVERVIEW  # the module's own page is what it opens on
        head = check_header({"title": title, "front": front, "data": data or {}})
        if not head["title"]:
            raise Problem("A page needs a title.")
        if not html.strip():
            raise Problem("A page needs its html: what it draws.")
        rows = self.run(head["data"])
        existing_head, body = split_header(html)
        if existing_head:
            raise Problem("Give the page's header through title and data, not inside html.")
        path.parent.mkdir(parents=True, exist_ok=True)
        was = path.exists()
        if front:
            self._unfront(m["id"], except_for=name)
        path.write_text(header_text(head["title"], head["data"], front=front) + body.lstrip("\n"))
        self.world.journal.append(
            "made" if not was else "changed",
            f"{'Made' if not was else 'Changed'} the page {head['title']} in {m['name']}"
            + (f" ({', '.join(f'{k}: {len(v)} rows' for k, v in rows.items())})" if rows else "")
            + ".", actor="alpha", module=m["id"], source=source,
            data={"page": name, "module": m["id"], "front": front, "data": sorted(rows)})
        self.world.files.sync_module(m)
        return {"page": name, "title": head["title"], "module": m["id"], "front": front,
                "path": str(path), "data": {k: len(v) for k, v in rows.items()},
                "made": not was}

    def _unfront(self, module_id: str, *, except_for: str) -> None:
        """One front page per module: the one marked before loses the mark in its header."""
        for other in self.names(module_id):
            if other == except_for:
                continue
            path = self.path_of(module_id, other)
            try:
                head, body = split_header(path.read_text())
            except Problem:
                continue
            if head.get("front"):
                checked = check_header(head)
                path.write_text(header_text(checked["title"] or other, checked["data"]) + body)

    def set_front(self, module_ref: str, name: str, front: bool = True) -> dict[str, Any]:
        """The person's choice on the module page: this page opens the module, or stops to."""
        m = self.world.modules.get(module_ref)
        path = self.path_of(m["id"], name)
        if not path.is_file():
            raise Problem(f"There is no page {name} in {m['name']}.")
        head, body = split_header(path.read_text())
        checked = check_header(head)
        if front:
            self._unfront(m["id"], except_for=name)
        path.write_text(header_text(checked["title"] or name, checked["data"], front=front) + body)
        self.world.journal.append("changed", f"{checked['title'] or name} is"
                                  f"{'' if front else ' no longer'} the front of {m['name']}.",
                                  actor="person", module=m["id"],
                                  data={"page": name, "front": front})
        self.world.files.sync_module(m)
        return next(p for p in self.all(m["id"]) if p["name"] == name)

    def remove(self, module_ref: str, name: str) -> None:
        m = self.world.modules.get(module_ref)
        path = self.path_of(m["id"], name)
        if not path.is_file():
            raise Problem(f"There is no page {name} in {m['name']}.")
        path.unlink()
        self.world.journal.append("changed", f"You removed the page {name} from {m['name']}.",
                                  actor="person", module=m["id"], data={"page": name})
        self.world.files.sync_module(m)

    # ---- its data, and the page as served ----

    def run(self, data: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
        """Every query of a header, on the read-only connection; a failing one is a Problem
        naming it."""
        out: dict[str, list[dict[str, Any]]] = {}
        for name, sql in data.items():
            try:
                # as many rows as a view in the window shows: the page draws them, the
                # model never reads them
                got = queries.query(self.world.path, sql, limit=settings.views.most_rows)
            except Problem as e:
                raise Problem(f"The data '{name}' does not run: {e}") from e
            out[name] = list(got.get("rows") or [])
        return out

    def data(self, module_ref: str, name: str) -> dict[str, list[dict[str, Any]]]:
        m = self.world.modules.get(module_ref)
        path = self.path_of(m["id"], name)
        if not path.is_file():
            raise Problem(f"There is no page {name} in {m['name']}.")
        head, _ = split_header(path.read_text())
        return self.run(check_header(head)["data"])

    def render(self, module_ref: str, name: str) -> str:
        """The page as the window's frame loads it: Alpha's runtime with the rows in it, then
        the page's own text. A header problem or a failing query is a Problem (the route
        answers it in words and the window shows it)."""
        m = self.world.modules.get(module_ref)
        path = self.path_of(m["id"], name)
        if not path.is_file():
            raise Problem(f"There is no page {name} in {m['name']}.")
        head, body = split_header(path.read_text())
        checked = check_header(head)
        rows = self.run(checked["data"])
        run = runtime(rows)
        title = checked["title"] or name
        if re.search(r"<html[\s>]", body, re.I):
            # a whole document: the runtime goes first in its head
            if re.search(r"<head[\s>]", body, re.I):
                return re.sub(r"(<head[^>]*>)", lambda mm: mm.group(1) + run, body, count=1,
                              flags=re.I)
            return re.sub(r"(<html[^>]*>)", lambda mm: mm.group(1) + "<head>" + run
                          + "</head>", body, count=1, flags=re.I)
        return (f"<!doctype html><html><head><meta charset=\"utf-8\"><title>{_esc(title)}</title>"
                f"{run}</head><body>{body}</body></html>")


def _esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _stamp(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, UTC).replace(microsecond=0).isoformat()
