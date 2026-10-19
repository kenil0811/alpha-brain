"""Phone numbers in one form (P8 of people-and-contacts-proposal.md, Q97; 19 Oct 2026): every
phone a person is known by is kept as E.164 (`+447700900123`), so `07700 900123` and
`+44 7700 900123` are one key and one person.

A number written without its country is read as the country most of the person's own numbers
that do carry a code are in, and failing that, the Mac's region. There is no setting (Q97): his
Mac's region said Singapore while its clock was on UK time, so the numbers themselves are the
better witness. A number that still can't be read is kept as it was written and never merges
with another.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable

import phonenumbers

# the region when nothing better is known: the Mac's, read once
_MAC_REGION: list[str | None] = []


def mac_region() -> str | None:
    """The Mac's region (`en_SG` → "SG"), or None off a Mac."""
    if not _MAC_REGION:
        region: str | None = None
        try:
            from Foundation import NSLocale  # the Mac's own setting, through pyobjc

            region = str(NSLocale.currentLocale().countryCode() or "") or None
        except Exception:
            region = None
        _MAC_REGION.append(region)
    return _MAC_REGION[0]


def e164(text: str, region: str | None = None) -> str | None:
    """The number in E.164, or None when it isn't a number that can be read: written with its
    country (`+44 …`, `0044 …`), or local to `region`."""
    raw = " ".join(str(text or "").split())
    if not raw or sum(ch.isdigit() for ch in raw) < 6:
        return None
    if raw.startswith("00"):
        raw = "+" + raw[2:]
    try:
        number = phonenumbers.parse(raw, None if raw.startswith("+") else region)
    except phonenumbers.NumberParseException:
        return None
    if not phonenumbers.is_possible_number(number):
        return None
    return str(phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164))


def region_of(number: str) -> str | None:
    """The country an E.164 number's code is in ("GB" for +44), by the code alone: a number
    need not be one in service for its country to be known."""
    try:
        code = phonenumbers.parse(number, None).country_code
    except phonenumbers.NumberParseException:
        return None
    region = phonenumbers.region_code_for_country_code(code) if code else None
    return region if region and region != "ZZ" else None


def likely_region(numbers: Iterable[str]) -> str | None:
    """The country most of these numbers that carry a code are in; the Mac's region when none
    does."""
    seen = Counter(r for n in numbers if str(n).strip().startswith(("+", "00"))
                   if (r := region_of(e164(str(n)) or "")))
    return seen.most_common(1)[0][0] if seen else mac_region()


def key(text: str, region: str | None) -> str:
    """The key a phone is kept by: E.164 when it can be read, else its digits as written (a
    key that matches only the same writing, so it never merges two people by a guess)."""
    return e164(text, region) or "".join(ch for ch in str(text) if ch.isdigit() or ch == "+")
