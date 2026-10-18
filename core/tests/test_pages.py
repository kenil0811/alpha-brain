"""Pages the model draws (harness §5, Q62; slice 7, 18 Oct 2026): a file in the module with a
header of title, front and data; served with its rows and Alpha's runtime under a content
policy; listed, fronted, carried by a kit, gone with the module."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.world import purge
from alpha.world.store import Problem
from alpha.world.world import World

CHART = """<style>svg { width: 100%; height: 200px; }</style>
<svg viewBox="0 0 300 100"><polyline id="line" fill="none" stroke="var(--primary)" /></svg>
<script>
function draw() {
  var pts = alpha.data.days.map(function (d, i) { return i * 40 + "," + (100 - d.calories / 30); });
  document.getElementById("line").setAttribute("points", pts.join(" "));
}
draw(); alpha.on("data", draw);
</script>
"""


def food(world: World) -> str:
    t = building(world)
    module = str(t.module_create("Food", goal="eat better")["id"])
    t.collection_create("food_log", "Food log", [
        {"name": "eaten_at", "kind": "date"}, {"name": "item", "kind": "text"},
        {"name": "calories", "kind": "number"}], module=module, title_field="item")
    for day, kcal in (("2026-10-12", 1800), ("2026-10-12", 400), ("2026-10-13", 2100)):
        world.collections.add("food_log", {"eaten_at": day, "item": "x", "calories": kcal},
                              {"by": "person"})
    return module


def front_of(world: World, module: str) -> str:
    page = world.pages.front(module)
    assert page is not None
    return str(page["name"])


DAYS = ("SELECT eaten_at AS day, SUM(calories) AS calories FROM rows_food_log"
        " GROUP BY eaten_at ORDER BY eaten_at")


def test_a_page_is_a_file_with_a_header_and_its_data_runs_once(world: World) -> None:
    module = food(world)
    out = world.pages.keep("Food", "summary", "Summary", CHART, {"days": DAYS}, front=True)
    assert out["made"] and out["data"] == {"days": 2} and out["front"]
    path = Path(out["path"])
    assert path == Path(world.path).parent / "modules" / module / "pages" / "summary.html"
    text = path.read_text()
    assert text.startswith("<!--alpha\ntitle: Summary\nfront: true\ndata:\n  days: SELECT")
    assert text.rstrip().endswith("</script>")
    listed = world.pages.all("Food")
    assert [(p["name"], p["title"], p["front"], p["data"]) for p in listed] == [
        ("summary", "Summary", True, ["days"])]
    assert yaml.safe_load((path.parent.parent / "module.yaml").read_text())["pages"] == ["summary"]
    made = world.journal.recent(3, kinds=["made"])[-1]
    assert made["text"] == "Made the page Summary in Food (days: 2 rows)."
    # a wrong SELECT fails now, in words, and writes nothing
    with pytest.raises(Problem, match="does not run"):
        world.pages.keep("Food", "bad", "Bad", CHART, {"days": "SELECT * FROM rows_nope"})
    assert not (path.parent / "bad.html").exists()
    with pytest.raises(Problem, match="one SELECT"):
        world.pages.keep("Food", "bad", "Bad", CHART, {"days": "DELETE FROM records"})
    with pytest.raises(Problem, match="snake_case"):
        world.pages.keep("Food", "Bad Name", "Bad", CHART)
    # the same name again changes it; a second front takes the mark from the first
    world.pages.keep("Food", "trend", "Trend", CHART, {"days": DAYS}, front=True)
    fronts = {p["name"]: p["front"] for p in world.pages.all("Food")}
    assert fronts == {"summary": False, "trend": True}
    assert front_of(world, "Food") == "trend"
    world.pages.set_front("Food", "summary")
    assert front_of(world, "Food") == "summary"


def test_a_page_is_served_with_its_rows_and_the_runtime_under_a_policy(world: World) -> None:
    food(world)
    world.pages.keep("Food", "summary", "Summary", CHART, {"days": DAYS})
    html = world.pages.render("Food", "summary")
    assert html.startswith("<!doctype html>") and "<title>Summary</title>" in html
    assert '"days": [{"day": "2026-10-12", "calories": 2200}' in html
    assert "window.alpha = alpha" in html and html.index("window.alpha") < html.index("<svg")
    # a whole document keeps its shape, the runtime first in its head
    whole = "<html><head><title>T</title></head><body><p>hi</p></body></html>"
    world.pages.keep("Food", "whole", "Whole", whole)
    served = world.pages.render("Food", "whole")
    assert served.startswith("<html><head><script>")
    assert served.endswith(whole[whole.index("<body>"):])
    # a header edited by hand into something wrong is said, not drawn blank
    path = Path(world.pages.path_of(world.modules.get("Food")["id"], "summary"))
    path.write_text(path.read_text().replace("days: SELECT", "days: DROP TABLE x --"))
    assert world.pages.all("Food")[0]["problem"].startswith("The data 'days' must be one SELECT")
    with pytest.raises(Problem, match="one SELECT"):
        world.pages.render("Food", "summary")


def test_the_routes_list_ticket_serve_front_and_remove(world: World) -> None:
    food(world)
    world.pages.keep("Food", "summary", "Summary", CHART, {"days": DAYS})
    c = TestClient(create_app(world, live=False, token="t"), headers={"Authorization": "Bearer t"})
    assert [p["name"] for p in c.get("/api/modules/Food/pages").json()] == ["summary"]
    ticket = c.post("/api/modules/Food/pages/summary/ticket").json()
    assert ticket["url"] == f"/api/pages/{ticket['ticket']}"
    # the frame loads it without the token, once
    bare = TestClient(create_app(world, live=False, token="t"))
    page = c.get(ticket["url"], headers={"Authorization": ""})
    assert page.status_code == 200 and page.headers["content-security-policy"].startswith(
        "default-src 'none'; script-src 'unsafe-inline'")
    assert "connect-src 'none'" in page.headers["content-security-policy"]
    assert "2026-10-13" in page.text
    assert c.get(ticket["url"]).status_code == 404  # used
    assert bare.get("/api/modules/Food/pages/summary/data").status_code == 401
    assert c.get("/api/modules/Food/pages/summary/data").json()["days"][1]["calories"] == 2100
    assert c.patch("/api/modules/Food/pages/summary", json={"front": True}).json()["front"]
    assert c.post("/api/modules/Food/pages/nope/ticket").status_code == 400
    assert c.delete("/api/modules/Food/pages/summary").json() == {"removed": "summary"}
    assert c.get("/api/modules/Food/pages").json() == []


def test_the_hand_makes_a_page_and_a_chart_list_is_a_list(world: World) -> None:
    food(world)
    h = Tools(world, turn="j_p")
    out = h.page_keep("Food", "summary", "Summary", CHART, {"days": DAYS}, front=True)
    assert out["page"] == "summary" and out["data"] == {"days": 2}
    bad = h.page_keep("Food", "x", "X", CHART, {"d": "SELECT * FROM nope"})
    assert "does not run" in bad["error"]
    kept = h.world_shape(table="food_log", saved_list={
        "title": "Calories per day", "view": "chart", "date_by": "eaten_at",
        "measure": "calories"})["saved_list"]
    assert kept["config"]["view"] == "chart" and kept["config"]["measure"] == "calories"
    assert "needs date_by" in h.list_save("food_log", "Bad", view="chart")["error"]
    assert "one of table, list, board" in h.list_save("food_log", "Bad", view="pie")["error"]
    assert world.journal.recent(2, kinds=["made"])[-1]["text"].startswith(
        'Kept the list "Calories per day" (chart) on Food log')


def test_a_kit_carries_the_pages_and_removal_takes_them(tmp_path: Path, world: World) -> None:
    module = food(world)
    world.pages.keep("Food", "summary", "Summary", CHART, {"days": DAYS}, front=True)
    out = world.kits.export("Food", to=tmp_path / "out")
    kit = Path(out["kit"])
    assert (kit / "pages" / "summary.html").is_file()
    assert "pages/summary.html" in (kit / "files.sha").read_text()
    other = World(tmp_path / "other" / "world.sqlite")
    installed = other.kits.install(kit)
    assert installed["pages"] == 1
    assert front_of(other, "Food") == "summary"
    assert other.pages.data("Food", "summary") == {"days": []}  # empty tables, the page draws
    other.close()
    purge.remove_module(world, module)
    assert not (Path(world.path).parent / "modules" / module).exists()
