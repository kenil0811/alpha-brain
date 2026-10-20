"""A site's robots rules (P14, Q114; RFC 9309), read by code before Alpha's readers read its
pages.

Alpha reads as its person's browser, so it follows the rules a site gives every agent
(`User-agent: *`). A rule's path may hold `*` (any characters) and end with `$` (the end of the
address); the longest rule that matches decides, and an allow wins a tie. Four of Kenil's broker
sites, read on 20 Oct 2026: POE allows everything; Accounting Biz Brokers keeps readers out of
`/wp-admin/` only; Accounting Practice Exchange has `Disallow: /*_rsc=`, a wildcard a careless
matcher would read as the whole site; ATB has no rules.

A site with no rules file (an answer in the 400s) allows everything. One that couldn't be
reached (the 500s, no answer) is read again on the next run, and nothing of the site is read
meanwhile: the standard's "assume complete disallow", said plainly.
"""

from __future__ import annotations

import re
import ssl
import urllib.error
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse

import certifi

from alpha.config import settings
from alpha.world.store import dumps, loads, now
from alpha.world.world import World

ALLOWED, DISALLOWED, UNREACHABLE = "allowed", "disallowed", "unreachable"
STALE_H = settings.readers.robots_stale_h
MOST_BYTES = 500 * 1024  # the standard's floor for what a reader of rules must parse
AGENT = "Alpha (a personal assistant reading on its owner's behalf)"
UNREACHABLE_WORDS = ("Alpha couldn't read {host}'s robots rules just now, so it read nothing"
                     " there; it tries again on the next run.")
Fetcher = Callable[[str], tuple[str, str | None]]


def parse(text: str) -> list[tuple[bool, str]]:
    """The rules every agent is given: (allow, path pattern), from each group whose user-agent
    lines include `*` (groups for the same agent are combined, as the standard says)."""
    rules: list[tuple[bool, str]] = []
    for_all = agents_line = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        field, value = (part.strip() for part in line.split(":", 1))
        field = field.lower()
        if field == "user-agent":
            if not agents_line:  # a new group begins
                for_all = False
            agents_line = True
            for_all = for_all or value == "*"
            continue
        agents_line = False
        if field in ("allow", "disallow") and for_all and value:
            rules.append((field == "allow", value))
    return rules


@lru_cache(maxsize=512)
def _pattern(path: str) -> re.Pattern[str]:
    end = path.endswith("$")
    body = path[:-1] if end else path
    return re.compile(".*".join(re.escape(part) for part in body.split("*")) + ("$" if end else ""))


def ruling(rules: list[tuple[bool, str]], url: str) -> tuple[bool, str | None]:
    """Whether the address may be read, and the rule that decided (None: no rule matched)."""
    parsed = urlparse(url)
    path = (parsed.path or "/") + (f"?{parsed.query}" if parsed.query else "")
    if path == "/robots.txt":
        return True, None
    best: tuple[int, bool, str] | None = None
    for allow, pattern in rules:
        if _pattern(pattern).match(path):
            if best is None or len(pattern) > best[0] or (len(pattern) == best[0] and allow):
                best = (len(pattern), allow, pattern)
    if best is None:
        return True, None
    return best[1], f"{'Allow' if best[1] else 'Disallow'}: {best[2]}"


def fetch(host: str) -> tuple[str, str | None]:
    """("rules", the file's text), ("none", None) when there is no file, or ("unreachable",
    None)."""
    request = urllib.request.Request(f"https://{host}/robots.txt", headers={"User-Agent": AGENT})
    context = ssl.create_default_context(cafile=certifi.where())
    try:
        with urllib.request.urlopen(request, timeout=15, context=context) as answer:
            return "rules", answer.read(MOST_BYTES).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return ("none", None) if 400 <= e.code < 500 else ("unreachable", None)
    except (urllib.error.URLError, OSError, ValueError):
        return "unreachable", None


class Robots:
    """A world's robots rules per site, read when a day old (`limits.toml`)."""

    def __init__(self, world: World, fetcher: Fetcher | None = None) -> None:
        self.world = world
        self.fetcher = fetcher or fetch

    def _rules(self, host: str) -> tuple[str, list[tuple[bool, str]]]:
        key = f"robots:{host}"
        row = self.world.store.one("SELECT value FROM meta WHERE key = ?", (key,))
        kept: dict[str, Any] = loads(row["value"], {}) if row else {}
        fresh = kept.get("read_at") and _hours_since(str(kept["read_at"])) < STALE_H
        if fresh:
            return str(kept["state"]), [(bool(a), str(p)) for a, p in kept.get("rules") or []]
        state, text = self.fetcher(host)
        if state == "unreachable":
            return state, []  # never kept: the next run asks again
        rules = parse(text) if text else []
        with self.world.store.tx() as db:
            db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                       (key, dumps({"state": state, "rules": rules, "read_at": now()})))
        return state, rules

    def check(self, url: str) -> tuple[str, str]:
        """(ALLOWED, words) / (DISALLOWED, words) / (UNREACHABLE, words) for one address."""
        host = urlparse(url).hostname or ""
        state, rules = self._rules(host)
        if state == "unreachable":
            return UNREACHABLE, UNREACHABLE_WORDS.format(host=host)
        if state == "none":
            return ALLOWED, f"{host} has no robots rules."
        ok, rule = ruling(rules, url)
        if ok:
            return ALLOWED, (f"{host}'s robots rules allow it ({rule})." if rule
                             else f"{host}'s robots rules allow it.")
        return DISALLOWED, (f"{host}'s robots rules ask automated readers not to read this"
                            f" page ({rule}).")


def _hours_since(stamp: str) -> float:
    try:
        then = datetime.fromisoformat(stamp)
    except ValueError:
        return float("inf")
    return (datetime.now(UTC) - then).total_seconds() / 3600
