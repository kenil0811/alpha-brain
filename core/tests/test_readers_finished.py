"""P14, readers finished (Q114, 20 Oct 2026): a site's robots rules read by code and its terms
kept with their own sentence; a reader's detail step on the own page of each new or changed
item; each value sourced to the page it was read from; keys that are each item's own ID. No
network: pages are a fake browser, robots rules a fake fetcher."""

from __future__ import annotations

from typing import Any

import pytest
from conftest import building

from alpha.connectors import robots
from alpha.connectors.browser import Browser
from alpha.mcp.tools import Tools
from alpha.runtime import pipeline
from alpha.world.world import World

LIST = "https://brokers.test/firms-for-sale"


def page_of(n: int) -> str:
    return f"https://brokers.test/listing/{n}"


def listings(world: World) -> None:
    t = building(world, turn="j_0")
    t.module_create("DealPilot", "the deals I look at")
    t.collection_create("listings", "Listings", [
        {"name": "listing_id", "kind": "text"}, {"name": "headline", "kind": "text"},
        {"name": "price", "kind": "number"}, {"name": "link", "kind": "url"},
        {"name": "broker", "kind": "text"}, {"name": "revenue", "kind": "number"}],
        module="DealPilot", title_field="headline")


def save_reader(world: World, *, detail: str | None = "return {}") -> None:
    world.readers.save("broker_list", site="brokers.test", url=LIST, script="x",
                       description="the firms for sale", to_end=False, count=3, page="link",
                       detail=detail)


def row(n: int, price: Any = 100_000, headline: str | None = None) -> dict[str, Any]:
    return {"listing_id": f"IL{n}", "headline": headline or f"Firm {n}", "price": price,
            "link": page_of(n)}


class Site:
    """A list page and each listing's own page; what was opened is kept."""

    def __init__(self, rows: list[dict[str, Any]], details: dict[str, Any] | None = None,
                 stop_after: int | None = None) -> None:
        self.rows = rows
        self.details = details if details is not None else {
            page_of(n): {"broker": f"Broker {n}", "revenue": n * 1000} for n in range(1, 9)}
        self.stop_after = stop_after
        self.opened: list[list[str]] = []

    def script(self, *_: Any, **__: Any) -> dict[str, Any]:
        return {"result": [dict(r) for r in self.rows], "needs_signin": False}

    def pages(self, urls: list[str], script: str, **_: Any) -> dict[str, Any]:
        self.opened.append(list(urls))
        read = urls if self.stop_after is None else urls[:self.stop_after]
        return {"pages": [{"url": u, "result": self.details.get(u)} for u in read],
                "stopped": "sign_in" if self.stop_after is not None else None}


def forget_robots(world: World) -> None:
    with world.store.tx() as db:
        db.execute("DELETE FROM meta WHERE key LIKE 'robots:%'")


def run(world: World, site: Site) -> dict[str, Any]:
    return pipeline.run_reader(world, "broker_list", "listings", "listing_id",
                               browser=site)  # type: ignore[arg-type]


def kept(world: World) -> dict[str, dict[str, Any]]:
    return {r["listing_id"]: r for r in world.collections.query("listings", limit=None)}


# ---- robots, by the standard ----

def test_robots_rules_match_by_the_standard() -> None:
    rules = robots.parse("User-agent: Googlebot\nDisallow: /\n\nUser-agent: other\nUser-agent: *"
                         "\nAllow: /example/page/\nDisallow: /example/page/disallowed.gif\n"
                         "Disallow: /*.gif$\nDisallow: /*_rsc=\n# a note\n")
    ruling = robots.ruling
    assert ruling(rules, "https://a.test/firms")[0]  # Googlebot's group isn't everyone's
    assert ruling(rules, "https://a.test/example/page/")[0]
    assert not ruling(rules, "https://a.test/example/page/disallowed.gif")[0]
    assert not ruling(rules, "https://a.test/x.gif")[0] and ruling(rules, "https://a.test/x.gifs")[0]
    # Accounting Practice Exchange's rule: only addresses carrying _rsc=, never the whole site
    assert ruling(rules, "https://a.test/cpa-firms-for-sale")[0]
    rsc = ruling(rules, "https://a.test/cpa-firms-for-sale?_rsc=1x")
    assert rsc == (False, "Disallow: /*_rsc=")
    tie = robots.parse("User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n")
    assert ruling(tie, "https://a.test/wp-admin/admin-ajax.php")[0]
    assert not ruling(tie, "https://a.test/wp-admin/x")[0]
    assert ruling(robots.parse("User-agent: *\nDisallow:\n"), "https://a.test/any")[0]


def test_robots_rules_are_kept_a_day_and_an_unreachable_site_is_asked_again(
        world: World) -> None:
    asked: list[str] = []

    def fetcher(host: str) -> tuple[str, str | None]:
        asked.append(host)
        return ("unreachable", None) if host == "down.test" else (
            "rules", "User-agent: *\nDisallow: /private/\n")

    r = robots.Robots(world, fetcher)
    assert r.check("https://up.test/firms")[0] == robots.ALLOWED
    state, words = r.check("https://up.test/private/x")
    assert state == robots.DISALLOWED and "Disallow: /private/" in words
    assert asked == ["up.test"]  # read once, kept
    assert r.check("https://down.test/x")[0] == robots.UNREACHABLE
    assert r.check("https://down.test/x")[0] == robots.UNREACHABLE
    assert asked.count("down.test") == 2  # never kept: asked again


# ---- what the site says comes first ----

def test_a_page_the_robots_rules_disallow_is_blocked_and_nothing_is_read(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    listings(world)
    save_reader(world)
    monkeypatch.setattr(robots, "fetch",
                        lambda host: ("rules", "User-agent: *\nDisallow: /firms-for-sale\n"))
    site = Site([row(1)])
    out = run(world, site)
    assert out["health"] == "blocked" and not kept(world)
    [source] = world.sources.of_reader("broker_list")
    assert source["status"] == "blocked" and source["robots"] == "disallowed"
    assert "Disallow: /firms-for-sale" in str(source["detail"])
    monkeypatch.setattr(robots, "fetch", lambda host: ("unreachable", None))
    forget_robots(world)
    assert run(world, site)["health"] == "unreachable"


def test_terms_that_dont_allow_automated_reading_block_the_source(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    listings(world)
    save_reader(world)
    terms_page = ("Terms of use. You may not use robots, scrapers or other automated means to"
                  " access the Site for any purpose.")
    monkeypatch.setattr(Browser, "read", lambda self, url, **k: {"text": terms_page})
    home = world.modules.home_thread()["id"]
    said = world.journal.append("said", "watch the broker's firms", actor="person", thread=home)
    tools = Tools(world, turn=said, thread=home)
    wrong = tools.source_add("Brokers", LIST, module="DealPilot", reader="broker_list",
                             terms="not allowed", terms_url="https://brokers.test/terms",
                             quote="Robots are welcome here.")
    assert "isn't on" in str(wrong.get("error"))
    out = tools.source_add("Brokers", LIST, module="DealPilot", reader="broker_list",
                           terms="not allowed", terms_url="https://brokers.test/terms",
                           quote="You may not use robots, scrapers or other automated means to"
                                 " access the Site for any purpose.")
    assert out["terms"] == "not_allowed" and out["status"] == "blocked"
    assert out["robots"] == "allowed"  # read by code as the source was added
    assert run(world, Site([row(1)]))["health"] == "blocked" and not kept(world)


# ---- the listing's own ID ----

def test_two_rows_sharing_a_key_or_one_item_new_and_gone_mean_a_broken_reader(
        world: World) -> None:
    listings(world)
    save_reader(world, detail=None)
    out = run(world, Site([row(1), {**row(2), "listing_id": "IL1"}]))
    assert out["health"] == "broken" and "share the key" in out["problem"] and not kept(world)
    assert run(world, Site([row(1), row(2)]))["health"] == "ok"
    # the site renumbered Firm 2 (a position, not its own ID): it would be new and gone at once
    out = run(world, Site([row(1), {**row(2), "listing_id": "IL9"}]))
    assert out["health"] == "broken" and "isn't stable" in out["problem"]
    assert set(kept(world)) == {"IL1", "IL2"}


# ---- the detail step, and every value's page ----

def test_the_detail_step_reads_new_and_changed_listings_and_sources_each_value(
        world: World) -> None:
    listings(world)
    save_reader(world)
    site = Site([row(1), row(2), row(3)])
    assert run(world, site)["health"] == "ok"
    assert site.opened == [[page_of(1), page_of(2), page_of(3)]]
    one = kept(world)["IL1"]
    assert one["broker"] == "Broker 1" and one["revenue"] == 1000
    sources = one["_provenance"]["fields"]
    assert sources["price"]["url"] == LIST  # read on the list
    assert sources["broker"]["url"] == page_of(1)  # read on its own page
    # nothing new or changed: no listing page opened
    run(world, Site([row(1), row(2), row(3)]))
    site = Site([row(1), row(2, price=150_000), row(3), row(4)])
    run(world, site)
    assert site.opened == [[page_of(2), page_of(4)]]
    assert kept(world)["IL2"]["price"] == 150000


def test_a_wall_stops_the_detail_pass_and_the_rest_are_read_next_time(world: World) -> None:
    listings(world)
    save_reader(world)
    site = Site([row(1), row(2), row(3)], stop_after=1)
    out = run(world, site)
    assert out["health"] == "ok"
    rows = kept(world)
    assert rows["IL1"]["broker"] == "Broker 1" and rows["IL2"].get("broker") is None
    assert rows["IL2"]["headline"] == "Firm 2"  # what the list gave stays
    assert "asked for a sign-in" in str(world.sources.of_reader("broker_list")[0]["detail"])
    site = Site([row(1), row(2), row(3)])
    run(world, site)
    assert site.opened == [[page_of(2), page_of(3)]]  # never read on their pages yet


def test_a_detail_script_that_finds_nothing_is_broken_and_nothing_is_written(
        world: World) -> None:
    listings(world)
    save_reader(world)
    out = run(world, Site([row(1), row(2), row(3)], details={}))
    assert out["health"] == "broken" and "detail script" in out["problem"]
    assert not kept(world)


def test_a_reader_is_kept_only_when_its_detail_script_reads_an_items_page(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    listings(world)
    home = world.modules.home_thread()["id"]
    said = world.journal.append("said", "watch the broker's firms", actor="person", thread=home)
    tools = Tools(world, turn=said, thread=home)
    monkeypatch.setattr(Browser, "script", lambda self, url, script, **k: {
        "result": [row(1), row(2)], "more_pages": False})
    gives: dict[str, Any] = {}
    monkeypatch.setattr(Browser, "pages", lambda self, urls, script, **k: {
        "pages": [{"url": urls[0], "result": gives.get("value")}], "stopped": None})
    out = tools.reader_save("broker_list", LIST, "x", "the firms for sale", page="link",
                            detail="return {}", whole=True)
    assert "returned nothing" in str(out.get("error"))
    out = tools.reader_save("broker_list", LIST, "x", "the firms for sale", detail="return {}",
                            whole=True)
    assert "needs page" in str(out.get("error"))
    gives["value"] = {"broker": "Broker 1"}
    out = tools.reader_save("broker_list", LIST, "x", "the firms for sale", page="link",
                            detail="return {broker: '…'}", whole=True)
    assert out["detail_sample"] == {"page": page_of(1), "broker": "Broker 1"}
    reader = world.readers.get("broker_list")
    assert reader["page"] == "link" and reader["detail"] == "return {broker: '…'}"
    monkeypatch.setattr(robots, "fetch", lambda host: ("rules", "User-agent: *\nDisallow: /\n"))
    forget_robots(world)
    assert "robots rules ask" in str(tools.reader_save("other_list", LIST, "x", "d",
                                                      whole=True).get("error"))
