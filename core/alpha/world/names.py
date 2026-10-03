"""One rule for the names Alpha gives the things it makes (tables and their fields, readers,
procedures, skills): lower-case letters, digits and underscores, starting with a letter, at most
48 characters. They are ids the model types and the person reads; one shape everywhere."""

from __future__ import annotations

import re

from alpha.world.store import Problem

NAME = re.compile(r"^[a-z][a-z0-9_]{0,47}$")


def check_name(name: str, what: str, example: str) -> None:
    if not NAME.match(name):
        raise Problem(f"'{name}' can't be a {what} name: use lower-case letters, digits and"
                      f" underscores, starting with a letter (e.g. {example}).")
