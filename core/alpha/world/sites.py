"""One rule for what a site is: the registrable domain of an address (linkedin.com for
https://www.linkedin.com/in/priya/, example.co.uk for jobs.example.co.uk). Readers, procedures,
sources, sign-ins and the browser's profiles all name sites this way, so a connection to a site
finds everything that reads or acts on it."""

from __future__ import annotations

from urllib.parse import urlparse

from alpha.world.store import Problem

TWO_PART = {"co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "co.in", "com.br", "co.jp",
            "co.nz", "com.sg"}


def site_of(url_or_site: str) -> str:
    host = urlparse(url_or_site if "://" in url_or_site else f"https://{url_or_site}").hostname
    if not host:
        raise Problem(f"'{url_or_site}' isn't a web address.")
    parts = host.lower().removeprefix("www.").split(".")
    n = 3 if ".".join(parts[-2:]) in TWO_PART else 2
    return ".".join(parts[-n:])
