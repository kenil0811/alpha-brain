# Shipped again, with a Python that can make a venv (11 October 2026, night)

Kenil: "do we have a shareable file that we can run on a fresh mac?" The zip on disk was from
9 October, before everything since (workflows, parts, the scorecard). Before shipping again,
one check from the bundled runtime found a gap: a module's build makes its own venv with
`$ALPHA_PYTHON -m venv`, and the shipped Python was pruned of `ensurepip`, so that command
failed ("ensurepip … returned non-zero exit status 1"). On Kenil's Mac the build session had
used the system's Python instead; on a fresh Mac no module could have been built.

- `desktop/scripts/ship.sh` keeps `ensurepip` and its smoke test now makes a venv from the
  bundled Python and asks its pip for its version ("venv ok").
- `just ship` run twice (the first tripped at its last line because the script was edited
  while running); the second clean: python ok, venv ok, node ok, the app with the runtime
  inside, `Alpha.zip` 116 MB (app 344 MB on disk). The shipped core carries today's code
  (`parts.retry`, the answer-many route), checked in its site-packages.

**Checked from the shipped app:** a venv made with the app's own Python, pip 25.2 inside it.
**Not proven:** a fresh Mac's first run (the friend's), still the acceptance (Q34).
