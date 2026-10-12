"""Places: where a city or an address is, from Apple's geocoder (the owner, 12 Oct; design
`map-view-plan.md`).

A place value is `{label, lat, lon, precision, source, estimated}`: the words the person or a page
gave (`label`), and the point Apple's geocoder (CoreLocation, the Mac's own, as Maps uses) found
for them, with how precise it is (address, city, region or country). A looked-up point is
estimated, said so on the value, and its source is "Apple Maps".

CoreLocation answers on a run loop the core's own threads don't spin, so each lookup runs in a
child process (`python -m alpha.connectors.places`) that spins its own: JSON lines in, JSON lines
out. A label that came back once is kept for the life of the process: Apple slows down a Mac
that asks the same thing over and over.

Apple finds *something* for nearly any text ("zzqqxx qqzz" is a farm road in Oklahoma), so a
result counts only when one of its names (the place, its town, region or country) is in what was
asked; otherwise the label stays without a point, and the map counts it as "no place". A real
name inside nonsense still counts ("zzqqxx nowhere" is Nowhere, Oklahoma): the point is
estimated and shown with its words, for the person to correct.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from typing import Any, Protocol

SOURCE = "Apple Maps"
PRECISIONS = ("address", "city", "region", "country")
# a lookup that hasn't answered by then has failed; Apple usually answers in under a second
DEADLINE_S = 15


class Geocoder(Protocol):
    """Each label's place, or None when it isn't found; a label it couldn't look up now (no
    network, Apple's limit) is left out of the answer."""

    def locate(self, labels: list[str]) -> dict[str, dict[str, Any] | None]: ...


def _words(text: str) -> set[str]:
    return {w for w in "".join(c if c.isalnum() else " " for c in text.casefold()).split() if w}


def _point(label: str, mark: dict[str, Any]) -> dict[str, Any] | None:
    """A placemark's point, if it is about what was asked (see the module's note)."""
    # ponytail: whole-word match, so "NYC" for New York is left unplaced; an alias list if it bites
    # not the country code: "in", "it", "no" are words in nearly any label
    names = [mark.get(k) for k in ("name", "thoroughfare", "locality", "region", "country")]
    asked = _words(label)
    if not any(n and _words(n) and _words(n) <= asked for n in names):
        return None
    precision = ("address" if mark.get("thoroughfare") else "city" if mark.get("locality")
                 else "region" if mark.get("region") else "country")
    return {"label": label, "lat": round(float(mark["lat"]), 6),
            "lon": round(float(mark["lon"]), 6),
            "precision": precision, "source": SOURCE, "estimated": True}


class AppleGeocoder:
    """Apple's geocoder, one child process per batch of new labels."""

    def __init__(self) -> None:
        self.seen: dict[str, dict[str, Any] | None] = {}

    def locate(self, labels: list[str]) -> dict[str, dict[str, Any] | None]:
        new = [x for x in dict.fromkeys(labels) if x not in self.seen]
        if new:
            try:
                done = subprocess.run(
                    [sys.executable, "-m", "alpha.connectors.places"],
                    input="\n".join(json.dumps(x) for x in new), capture_output=True, text=True,
                    timeout=DEADLINE_S * len(new) + 10, check=False)
                marks = [json.loads(line) for line in done.stdout.splitlines() if line.strip()]
            except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
                marks = []
            for label, mark in zip(new, marks, strict=False):
                # a failed lookup (no network, Apple's limit) isn't kept: it may work later
                if mark.get("error") is None:
                    self.seen[label] = _point(label, mark["mark"]) if mark.get("mark") else None
        return {x: self.seen[x] for x in labels if x in self.seen}


def _lookup(text: str) -> dict[str, Any]:
    """One lookup in this process, spinning the run loop CoreLocation answers on."""
    import CoreLocation
    from Foundation import NSDate, NSRunLoop

    out: dict[str, Any] = {}

    def done(marks: Any, error: Any) -> None:
        out["marks"], out["error"] = marks, error

    CoreLocation.CLGeocoder.alloc().init().geocodeAddressString_completionHandler_(text, done)
    end = time.monotonic() + DEADLINE_S
    while "marks" not in out and time.monotonic() < end:
        NSRunLoop.currentRunLoop().runUntilDate_(NSDate.dateWithTimeIntervalSinceNow_(0.05))
    if "marks" not in out:
        return {"error": "no answer"}
    error = out["error"]
    if error is not None:
        # 8 is "nothing found" (kCLErrorGeocodeFoundNoResult): an answer, not a failure
        return {"mark": None, "error": None} if int(error.code()) == 8 else {
            "error": str(error.localizedDescription())}
    if not out["marks"]:
        return {"mark": None, "error": None}
    m = out["marks"][0]
    c = m.location().coordinate()

    def s(v: Any) -> str | None:
        return str(v) if v else None
    return {"error": None, "mark": {
        "lat": c.latitude, "lon": c.longitude, "name": s(m.name()),
        "thoroughfare": s(m.thoroughfare()),
        "locality": s(m.locality()), "region": s(m.administrativeArea()), "country": s(m.country()),
        "country_code": s(m.ISOcountryCode())}}


if __name__ == "__main__":
    for line in sys.stdin:
        if line.strip():
            print(json.dumps(_lookup(json.loads(line))), flush=True)
